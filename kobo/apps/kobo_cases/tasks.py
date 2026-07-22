from django.db import transaction

from kobo.celery import celery_app
from kpi.models.asset_file import AssetFile
from kpi.utils.log import logging

from .models import CaseEvent, CaseLink, CaseRecord, log_case_event
from .utils import extract_submission_value


@celery_app.task(queue='kpi_low_priority_queue')
def sync_case_link_media(case_table_uid: str):
    """
    Re-synchronize the media metadata (hash) of every deployed project linked
    to the given case table, so form clients re-download the CSV.
    """
    links = CaseLink.objects.filter(
        case_table__uid=case_table_uid
    ).select_related('asset')
    synced_asset_ids = set()
    for link in links:
        asset = link.asset
        if asset.pk in synced_asset_ids or not asset.has_deployment:
            continue
        try:
            asset.deployment.sync_media_files(AssetFile.PAIRED_DATA)
            synced_asset_ids.add(asset.pk)
        except Exception as e:
            logging.error(
                f'sync_case_link_media: failed for asset {asset.uid}: {e}',
                exc_info=True,
            )


@celery_app.task(queue='kpi_low_priority_queue')
def sync_case_records(asset_uid: str, submission_id: int):
    """
    Write-back: apply a new submission to the case table(s) linked to the
    project. The answer to `case_id_xpath` selects the record; each entry of
    `field_mappings` copies one answer into one case column.
    """
    # Imported here to avoid a circular import at module load
    from kpi.models import Asset

    try:
        asset = Asset.objects.get(uid=asset_uid)
    except Asset.DoesNotExist:
        return

    links = list(
        asset.case_links.filter(write_back=True).select_related('case_table')
    )
    if not links or not asset.has_deployment:
        return

    submissions = asset.deployment.get_submissions(
        user=asset.owner, submission_ids=[submission_id]
    )
    if not submissions:
        logging.warning(
            f'sync_case_records: submission {submission_id} not found '
            f'for asset {asset_uid}'
        )
        return
    submission = submissions[0]

    for link in links:
        table = link.case_table
        case_id = extract_submission_value(submission, link.case_id_xpath)
        if case_id is None or str(case_id).strip() == '':
            continue
        case_id = str(case_id).strip()

        updates = {}
        for sub_field, column in (link.field_mappings or {}).items():
            if not column:
                continue
            value = extract_submission_value(submission, sub_field)
            if value is not None:
                updates[column] = str(value)

        with transaction.atomic():
            record = (
                CaseRecord.objects.select_for_update()
                .filter(table=table, key=case_id)
                .first()
            )
            was_created = record is None
            if record is None:
                if not link.create_missing:
                    continue
                record = CaseRecord(table=table, key=case_id, data={})
            changes = {}
            for column, new_value in updates.items():
                old_value = record.data.get(column, '')
                if old_value != new_value:
                    changes[column] = [old_value, new_value]
            record.data.update(updates)
            record.save()
            if updates:
                table.ensure_columns(list(updates.keys()))
            table.bump_data_version()

        if was_created or changes:
            log_case_event(
                table,
                case_id,
                CaseEvent.SOURCE_SUBMISSION,
                CaseEvent.ACTION_CREATED if was_created else CaseEvent.ACTION_UPDATED,
                changes=changes,
                username=str(submission.get('_submitted_by') or ''),
                asset=asset,
                submission_id=submission_id,
            )

        # Propagate the new data version to all projects using this table
        sync_case_link_media.delay(table.uid)
