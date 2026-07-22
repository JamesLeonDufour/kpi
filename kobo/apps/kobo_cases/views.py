from django.db import transaction
from django.db.models import Count
from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_extensions.mixins import NestedViewSetMixin

from kpi.permissions import AssetEditorPermission, XMLExternalDataPermission
from kpi.utils.viewset_mixins import AssetNestedObjectViewsetMixin

from .models import CaseEvent, CaseLink, CaseRecord, CaseTable, log_case_event
from .serializers import (
    CaseEventSerializer,
    CaseLinkSerializer,
    CaseRecordSerializer,
    CaseTableSerializer,
)
from .utils import import_table_csv, render_table_csv, schedule_media_resync


class CaseRecordPagination(LimitOffsetPagination):
    default_limit = 1000
    max_limit = 30000


class CaseTableViewSet(viewsets.ModelViewSet):
    """
    Case tables — user-owned relational datasets for case management.

    Available actions:
     - list      → GET     /api/v2/case-tables/
     - create    → POST    /api/v2/case-tables/
     - retrieve  → GET     /api/v2/case-tables/{uid}/
     - update    → PATCH   /api/v2/case-tables/{uid}/
     - delete    → DELETE  /api/v2/case-tables/{uid}/
     - upload    → POST    /api/v2/case-tables/{uid}/upload/
                   (multipart `file`; `replace=true` deletes rows missing
                   from the file)
     - content   → GET     /api/v2/case-tables/{uid}/content/  (raw CSV)
    """

    serializer_class = CaseTableSerializer
    permission_classes = (IsAuthenticated,)
    lookup_field = 'uid'

    def get_queryset(self):
        return CaseTable.objects.for_user(self.request.user).annotate(
            records_count=Count('records')
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def perform_update(self, serializer):
        if serializer.instance.owner != self.request.user:
            raise PermissionDenied(
                'Only the owner can modify the table settings'
            )
        table = serializer.save()
        table.bump_data_version()
        schedule_media_resync(table)

    def perform_destroy(self, instance):
        if instance.owner != self.request.user:
            raise PermissionDenied('Only the owner can delete the table')
        instance.delete()

    @action(detail=True, methods=['POST'])
    def upload(self, request, uid=None):
        table = self.get_object()
        uploaded = request.FILES.get('file')
        if uploaded is None:
            return Response(
                {'detail': 'Missing `file` upload'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        replace = str(
            request.data.get('replace', 'false')
        ).lower() in ('1', 'true', 'yes')
        try:
            csv_text = uploaded.read().decode('utf-8-sig')
        except UnicodeDecodeError:
            return Response(
                {'detail': 'The file must be UTF-8 encoded CSV'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            with transaction.atomic():
                stats = import_table_csv(table, csv_text, replace=replace)
        except ValueError as e:
            return Response(
                {'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST
            )
        log_case_event(
            table,
            '',
            CaseEvent.SOURCE_UPLOAD,
            CaseEvent.ACTION_IMPORTED,
            changes=stats,
            username=request.user.username,
        )
        return Response(stats)

    @action(detail=True, methods=['GET'])
    def links(self, request, uid=None):
        """
        Projects this case table is linked to (reverse of asset case-links).
        """
        table = self.get_object()
        serializer = CaseLinkSerializer(
            table.links.select_related('case_table', 'asset').all(),
            many=True,
            context=self.get_serializer_context(),
        )
        return Response(serializer.data)

    @action(detail=True, methods=['GET'])
    def content(self, request, uid=None):
        table = self.get_object()
        response = HttpResponse(
            render_table_csv(table), content_type='text/csv; charset=utf-8'
        )
        response['Content-Disposition'] = (
            f'attachment; filename="{table.uid}.csv"'
        )
        return response

    @action(detail=True, methods=['GET'])
    def events(self, request, uid=None):
        """
        Case history: newest first, optionally filtered with `?record_key=`.
        """
        table = self.get_object()
        queryset = table.events.all()
        record_key = request.query_params.get('record_key')
        if record_key:
            queryset = queryset.filter(record_key=record_key)
        paginator = CaseRecordPagination()
        paginator.default_limit = 100
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = CaseEventSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class CaseTableNestedViewsetMixin(NestedViewSetMixin):

    @property
    def case_table(self):
        if not hasattr(self, '_case_table'):
            uid = self.get_parents_query_dict().get('table')
            table = CaseTable.objects.for_user(self.request.user).filter(
                uid=uid
            ).first()
            if table is None:
                from django.http import Http404

                raise Http404
            setattr(self, '_case_table', table)
        return self._case_table


class CaseRecordViewSet(CaseTableNestedViewsetMixin, viewsets.ModelViewSet):
    """
    Rows of one case table.

    Available actions:
     - list     → GET    /api/v2/case-tables/{uid}/records/?limit=&offset=
     - create   → POST   /api/v2/case-tables/{uid}/records/
     - retrieve → GET    /api/v2/case-tables/{uid}/records/{id}/
     - update   → PATCH  /api/v2/case-tables/{uid}/records/{id}/
     - delete   → DELETE /api/v2/case-tables/{uid}/records/{id}/
    """

    serializer_class = CaseRecordSerializer
    permission_classes = (IsAuthenticated,)
    pagination_class = CaseRecordPagination

    def get_queryset(self):
        return CaseRecord.objects.filter(table=self.case_table)

    def _data_changed(self):
        table = self.case_table
        table.bump_data_version()
        schedule_media_resync(table)

    def perform_create(self, serializer):
        record = serializer.save(table=self.case_table)
        self.case_table.ensure_columns(list(record.data.keys()))
        log_case_event(
            self.case_table,
            record.key,
            CaseEvent.SOURCE_MANUAL,
            CaseEvent.ACTION_CREATED,
            changes={column: ['', value] for column, value in record.data.items()},
            username=self.request.user.username,
        )
        self._data_changed()

    def perform_update(self, serializer):
        old_data = dict(serializer.instance.data)
        record = serializer.save()
        self.case_table.ensure_columns(list(record.data.keys()))
        changes = {}
        for column in set(old_data) | set(record.data):
            old_value = old_data.get(column, '')
            new_value = record.data.get(column, '')
            if old_value != new_value:
                changes[column] = [old_value, new_value]
        if changes:
            log_case_event(
                self.case_table,
                record.key,
                CaseEvent.SOURCE_MANUAL,
                CaseEvent.ACTION_UPDATED,
                changes=changes,
                username=self.request.user.username,
            )
        self._data_changed()

    def perform_destroy(self, instance):
        log_case_event(
            self.case_table,
            instance.key,
            CaseEvent.SOURCE_MANUAL,
            CaseEvent.ACTION_DELETED,
            changes={column: [value, ''] for column, value in instance.data.items()},
            username=self.request.user.username,
        )
        instance.delete()
        self._data_changed()


class CaseLinkViewSet(
    AssetNestedObjectViewsetMixin, NestedViewSetMixin, viewsets.ModelViewSet
):
    """
    Links between one project (asset) and case tables.

    Available actions:
     - list     → GET    /api/v2/assets/{uid_asset}/case-links/
     - create   → POST   /api/v2/assets/{uid_asset}/case-links/
     - retrieve → GET    /api/v2/assets/{uid_asset}/case-links/{uid_case_link}/
     - update   → PATCH  /api/v2/assets/{uid_asset}/case-links/{uid_case_link}/
     - delete   → DELETE /api/v2/assets/{uid_asset}/case-links/{uid_case_link}/
     - external → GET    /api/v2/assets/{uid_asset}/case-links/{uid_case_link}/external.csv

    `external` serves the linked case table as CSV, rendered live from the
    database — it is the URL form clients download the "media file" from.
    """

    serializer_class = CaseLinkSerializer
    permission_classes = (AssetEditorPermission,)
    lookup_field = 'uid'
    lookup_url_kwarg = 'uid_case_link'

    def get_queryset(self):
        return CaseLink.objects.filter(
            asset=self.asset
        ).select_related('case_table')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if not hasattr(self, 'swagger_fake_view'):
            context['asset'] = self.asset
        return context

    def perform_create(self, serializer):
        link = serializer.save(asset=self.asset)
        schedule_media_resync(link.case_table)

    def perform_update(self, serializer):
        link = serializer.save()
        schedule_media_resync(link.case_table)

    @action(
        detail=True,
        methods=['GET'],
        permission_classes=[XMLExternalDataPermission],
        filter_backends=[],
    )
    def external(self, request, uid_case_link=None, **kwargs):
        link = self.get_object()
        table = link.case_table
        response = HttpResponse(
            render_table_csv(table), content_type='text/csv; charset=utf-8'
        )
        response['Content-Disposition'] = (
            f'attachment; filename="{link.filename}"'
        )
        return response
