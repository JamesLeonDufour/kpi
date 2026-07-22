import csv
import io

from kpi.utils.log import logging


def render_table_csv(table) -> str:
    """
    Render the current state of a `CaseTable` as CSV text, with the key
    column first — the exact shape `pulldata()` and `select_*_from_file`
    expect.
    """
    columns = table.column_names
    header = [table.key_column] + columns
    out = io.StringIO()
    writer = csv.writer(out, lineterminator='\r\n')
    writer.writerow(header)
    for record in table.records.all().iterator():
        row = [record.key]
        for column in columns:
            value = record.data.get(column, '')
            row.append('' if value is None else str(value))
        writer.writerow(row)
    return out.getvalue()


def import_table_csv(table, csv_text: str, replace: bool = False) -> dict:
    """
    Import CSV content into a `CaseTable`.

    The first column of the file — or, if present, the column whose header
    equals `table.key_column` — is used as the record key. Rows whose key
    already exists are updated (upsert); other rows are created. With
    `replace=True` existing records not present in the file are deleted.

    Returns stats: {'created': int, 'updated': int, 'deleted': int,
    'skipped': int, 'columns': [..]}
    """
    from .models import CaseRecord

    reader = csv.reader(io.StringIO(csv_text))
    try:
        header = next(reader)
    except StopIteration:
        raise ValueError('Empty CSV file')

    header = [h.strip() for h in header]
    if not any(header):
        raise ValueError('CSV file has an empty header row')

    if table.key_column in header:
        key_index = header.index(table.key_column)
    else:
        key_index = 0
        table.key_column = header[0]
        table.save(update_fields=['key_column', 'date_modified'])

    value_columns = [
        (i, name)
        for i, name in enumerate(header)
        if i != key_index and name
    ]
    table.ensure_columns([name for _, name in value_columns])

    existing = {r.key: r for r in table.records.all()}
    seen_keys = set()
    created = updated = skipped = 0

    for row in reader:
        if not row or key_index >= len(row):
            skipped += 1
            continue
        key = row[key_index].strip()
        if not key or key in seen_keys:
            skipped += 1
            continue
        seen_keys.add(key)
        data = {}
        for i, name in value_columns:
            data[name] = row[i].strip() if i < len(row) else ''
        record = existing.get(key)
        if record is None:
            CaseRecord.objects.create(table=table, key=key, data=data)
            created += 1
        else:
            record.data.update(data)
            record.save(update_fields=['data', 'date_modified'])
            updated += 1

    deleted = 0
    if replace:
        obsolete_keys = set(existing.keys()) - seen_keys
        if obsolete_keys:
            deleted, _ = table.records.filter(key__in=obsolete_keys).delete()

    table.bump_data_version()
    schedule_media_resync(table)

    return {
        'created': created,
        'updated': updated,
        'deleted': deleted,
        'skipped': skipped,
        'columns': [table.key_column] + table.column_names,
    }


def extract_submission_value(submission: dict, field: str):
    """
    Pull a value out of a submission JSON dict by question name or xpath.
    Tries the exact key first, then falls back to matching the last path
    segment so `case_id` finds `group_intro/case_id`.
    """
    if not field:
        return None
    if field in submission:
        return submission[field]
    for key, value in submission.items():
        if key.startswith('_'):
            continue
        if key.split('/')[-1] == field:
            return value
    return None


def schedule_case_write_back(asset_uid: str, submission_id: int):
    """
    Called (on commit) for every new submission; cheap no-op for projects
    without an active case link. Must never break submission processing.
    """
    try:
        from .models import CaseLink
        from .tasks import sync_case_records

        if CaseLink.objects.filter(
            asset__uid=asset_uid, write_back=True
        ).exists():
            sync_case_records.delay(asset_uid, submission_id)
    except Exception as e:
        logging.error(f'schedule_case_write_back failed: {e}', exc_info=True)


def schedule_media_resync(table):
    """
    Push the table's new data version to every deployed project linked to it,
    so Enketo/Collect see a fresh media hash on their next form load.
    """
    try:
        from .tasks import sync_case_link_media

        sync_case_link_media.delay(table.uid)
    except Exception as e:
        logging.error(f'schedule_media_resync failed: {e}', exc_info=True)
