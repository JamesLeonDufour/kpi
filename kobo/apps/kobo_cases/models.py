import uuid

from django.conf import settings
from django.db import models

from kpi.fields import KpiUidField
from kpi.models.asset_file import AbstractFormMedia, AssetFile
from kpi.utils.hash import calculate_hash
from kpi.utils.urls import versioned_reverse


def new_data_version():
    return uuid.uuid4().hex


class CaseTableManager(models.Manager):

    def for_user(self, user):
        """
        Tables the user can work with: their own, plus tables other members
        of their organization shared with the org.
        """
        query = models.Q(owner=user)
        organization = getattr(user, 'organization', None)
        if organization is not None:
            query |= models.Q(
                share_with_org=True,
                owner__organizations_organization=organization,
            )
        return self.filter(query).distinct()


class CaseTable(models.Model):
    """
    A user-owned relational dataset (e.g. a beneficiary/case registry).

    The schema is dynamic: `columns` holds an ordered list of
    `{'name': <machine name>, 'label': <human label>}` dicts, and each
    `CaseRecord` stores its values in a JSON dict keyed by column name.
    `key_column` is the primary-key-like column used to match records
    against form submissions (e.g. `case_id`).

    `data_version` changes on every write to the table (schema or records)
    so that linked forms can detect that their attached CSV is stale.
    """

    uid = KpiUidField(uid_prefix='ct')
    name = models.CharField(max_length=255)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name='case_tables',
        on_delete=models.CASCADE,
    )
    key_column = models.CharField(max_length=64, default='case_id')
    columns = models.JSONField(default=list)
    data_version = models.CharField(max_length=32, default=new_data_version)
    # Members of the owner's organization get full access to the table
    share_with_org = models.BooleanField(default=False)
    date_created = models.DateTimeField(auto_now_add=True)
    date_modified = models.DateTimeField(auto_now=True)

    objects = CaseTableManager()

    class Meta:
        ordering = ['-date_modified']

    def __str__(self):
        return f'{self.name} ({self.uid})'

    @property
    def column_names(self) -> list[str]:
        return [c['name'] for c in self.columns if c.get('name')]

    def bump_data_version(self, save: bool = True):
        self.data_version = new_data_version()
        if save:
            self.save(update_fields=['data_version', 'date_modified'])

    def ensure_columns(self, names: list[str]):
        """
        Add any missing column definitions (used by CSV upload and
        submission write-back so unknown columns never get lost).
        """
        known = set(self.column_names)
        changed = False
        for name in names:
            name = name.strip()
            if not name or name == self.key_column or name in known:
                continue
            self.columns.append({'name': name, 'label': name})
            known.add(name)
            changed = True
        if changed:
            self.save(update_fields=['columns', 'date_modified'])
        return changed


class CaseRecord(models.Model):
    """
    One row of a `CaseTable`. `key` is the value of the table's key column;
    all other cell values live in `data`, keyed by column name.
    """

    table = models.ForeignKey(
        CaseTable, related_name='records', on_delete=models.CASCADE
    )
    key = models.CharField(max_length=255)
    data = models.JSONField(default=dict)
    date_created = models.DateTimeField(auto_now_add=True)
    date_modified = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = (('table', 'key'),)
        ordering = ['pk']

    def __str__(self):
        return f'{self.table.name}[{self.key}]'


class CaseLink(models.Model, AbstractFormMedia):
    """
    Attaches a `CaseTable` to a deployed project (`Asset`) as a *live* CSV
    media file, and optionally maps submitted answers back onto the matching
    case record ("write-back").

    The CSV is never stored: `external` endpoint renders it from the current
    table contents on every request, and `md5_hash` is derived from
    `CaseTable.data_version`, so the OpenRosa media-sync machinery (the same
    one used by Dynamic Data Attachments, see `kpi.models.PairedData`)
    notifies Enketo/Collect whenever the data changes.

    Inside the form, the file behaves exactly like an uploaded CSV named
    `filename`, e.g. `pulldata('cases', 'status', 'case_id', ${case_id})`
    for `filename == 'cases.csv'`, or `select_one_from_file cases.csv`.
    """

    uid = KpiUidField(uid_prefix='cl')
    asset = models.ForeignKey(
        'kpi.Asset', related_name='case_links', on_delete=models.CASCADE
    )
    case_table = models.ForeignKey(
        CaseTable, related_name='links', on_delete=models.CASCADE
    )
    # Backs the `filename` property below (see its docstring for why this
    # can't be a plain field named `filename`).
    _filename = models.CharField(
        max_length=255, default='cases.csv', db_column='filename'
    )
    # Name (or full group path) of the question whose answer holds the case id
    case_id_xpath = models.CharField(max_length=255)
    # {submission question name/xpath: case table column} written on submission
    field_mappings = models.JSONField(default=dict, blank=True)
    write_back = models.BooleanField(default=True)
    # Create a new case record when a submission references an unknown case id
    create_missing = models.BooleanField(default=True)
    synced_with_backend = models.BooleanField(default=False)
    date_created = models.DateTimeField(auto_now_add=True)
    date_modified = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = (('asset', 'case_table'), ('asset', '_filename'))
        ordering = ['pk']

    def __str__(self):
        return f'{self.asset.uid} ↔ {self.case_table.uid} ({self.filename})'

    def delete(self, force=False, **kwargs):
        # `force` implements `SyncBackendMediaInterface.delete()`, called by
        # `sync_media_files()` when vacuuming orphans
        return super().delete(**kwargs)

    @property
    def backend_media_id(self):
        """
        Implements `SyncBackendMediaInterface.backend_media_id()`
        """
        from kpi.urls.router_api_v2 import URL_NAMESPACE  # avoid circular imports
        from rest_framework.reverse import reverse

        external_url = reverse(
            f'{URL_NAMESPACE}:case-link-external',
            kwargs={
                'uid_asset': self.asset.uid,
                'uid_case_link': self.uid,
                'format': 'csv',
            },
        )
        return f'{settings.KOBOFORM_URL}{external_url}'

    @property
    def deleted_at(self):
        """
        Implements `SyncBackendMediaInterface.deleted_at()`
        """
        return None

    @property
    def filename(self):
        """
        Implements `OpenRosaManifestInterface.filename()` and
        `SyncBackendMediaInterface.filename()`.

        This must be a `@property`, not a plain field named `filename`:
        Django's `ModelBase` adds field attributes to the class *after*
        `ABCMeta` has already computed `__abstractmethods__` from the
        interfaces above, so a field literally named `filename` never
        actually satisfies the abstract method — `CaseLink` becomes
        permanently uninstantiable (`TypeError: Can't instantiate
        abstract class`). Backed by `_filename` instead.
        """
        return self._filename

    @filename.setter
    def filename(self, value):
        self._filename = value

    @property
    def file_type(self):
        """
        Piggy-back on the paired-data metadata type: it is synchronized to
        KoboCAT as a remote URL whose hash is refreshed in place, which is
        exactly the behaviour a live CSV needs.
        """
        return AssetFile.PAIRED_DATA

    def get_download_url(self, request):
        """
        Implements `OpenRosaManifestInterface.get_download_url()`
        """
        from kpi.constants import API_NAMESPACES

        return versioned_reverse(
            'case-link-external',
            args=(self.asset.uid, self.uid, 'csv'),
            request=request,
            url_namespace=API_NAMESPACES['default'],
        )

    @property
    def md5_hash(self):
        """
        Implements `OpenRosaManifestInterface.md5_hash()` and
        `SyncBackendMediaInterface.md5_hash()`.

        Deterministic per data version: media sync only propagates a new hash
        when the case table actually changed.
        """
        return calculate_hash(
            f'{self.case_table.uid}.{self.case_table.data_version}',
            prefix=True,
        )

    @property
    def is_remote_url(self):
        """
        Implements `SyncBackendMediaInterface.is_remote_url()`
        """
        return True

    @property
    def mimetype(self):
        """
        Implements `SyncBackendMediaInterface.mimetype()`
        """
        return 'text/csv'


class CaseEvent(models.Model):
    """
    History log: one entry per change applied to a case table, so users can
    trace which submission, upload, or manual edit touched which record.
    """

    SOURCE_MANUAL = 'manual'
    SOURCE_UPLOAD = 'upload'
    SOURCE_SUBMISSION = 'submission'
    SOURCE_API = 'api'
    SOURCE_CHOICES = (
        (SOURCE_MANUAL, SOURCE_MANUAL),
        (SOURCE_UPLOAD, SOURCE_UPLOAD),
        (SOURCE_SUBMISSION, SOURCE_SUBMISSION),
        (SOURCE_API, SOURCE_API),
    )

    ACTION_CREATED = 'created'
    ACTION_UPDATED = 'updated'
    ACTION_DELETED = 'deleted'
    ACTION_IMPORTED = 'imported'

    table = models.ForeignKey(
        CaseTable, related_name='events', on_delete=models.CASCADE
    )
    # The key is kept as plain text so history survives record deletion.
    # Empty string is used for table-wide events (e.g. CSV imports).
    record_key = models.CharField(max_length=255, blank=True, default='')
    source = models.CharField(max_length=16, choices=SOURCE_CHOICES)
    action = models.CharField(max_length=16)
    # For record events: {column: [old_value, new_value]}
    # For imports: the import stats dict
    changes = models.JSONField(default=dict, blank=True)
    username = models.CharField(max_length=150, blank=True, default='')
    asset_uid = models.CharField(max_length=32, blank=True, default='')
    asset_name = models.CharField(max_length=255, blank=True, default='')
    submission_id = models.IntegerField(null=True, blank=True)
    date_created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-pk']
        indexes = [
            models.Index(fields=['table', 'record_key']),
        ]

    def __str__(self):
        return (
            f'{self.table_id}[{self.record_key}] {self.action} '
            f'({self.source})'
        )


def log_case_event(
    table: CaseTable,
    record_key: str,
    source: str,
    action: str,
    changes: dict | None = None,
    username: str = '',
    asset=None,
    submission_id: int | None = None,
):
    """
    Best-effort history logging — must never break the write it describes.
    """
    try:
        CaseEvent.objects.create(
            table=table,
            record_key=record_key or '',
            source=source,
            action=action,
            changes=changes or {},
            username=username or '',
            asset_uid=getattr(asset, 'uid', '') or '',
            asset_name=getattr(asset, 'name', '') or '',
            submission_id=submission_id,
        )
    except Exception:
        from kpi.utils.log import logging

        logging.error('log_case_event failed', exc_info=True)
