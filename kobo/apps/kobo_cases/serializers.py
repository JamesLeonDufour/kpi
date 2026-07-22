from rest_framework import serializers
from rest_framework.reverse import reverse

from .models import CaseEvent, CaseLink, CaseRecord, CaseTable


class CaseTableSerializer(serializers.ModelSerializer):

    url = serializers.SerializerMethodField()
    records_count = serializers.SerializerMethodField()
    owner_username = serializers.CharField(
        source='owner.username', read_only=True
    )

    class Meta:
        model = CaseTable
        fields = (
            'uid',
            'url',
            'name',
            'owner_username',
            'key_column',
            'columns',
            'data_version',
            'share_with_org',
            'records_count',
            'date_created',
            'date_modified',
        )
        read_only_fields = ('uid', 'data_version', 'date_created', 'date_modified')

    def get_url(self, obj):
        request = self.context.get('request')
        return reverse(
            'api_v2:case-table-detail', args=(obj.uid,), request=request
        )

    def get_records_count(self, obj):
        # Provided by the queryset annotation when listing; falls back to
        # a COUNT query on detail views.
        if hasattr(obj, 'records_count'):
            return obj.records_count
        return obj.records.count()

    def validate_columns(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('`columns` must be a list')
        cleaned = []
        seen = set()
        for item in value:
            if isinstance(item, str):
                item = {'name': item, 'label': item}
            if not isinstance(item, dict) or not item.get('name'):
                raise serializers.ValidationError(
                    'Each column needs at least a `name`'
                )
            name = str(item['name']).strip()
            if name in seen:
                continue
            seen.add(name)
            cleaned.append(
                {'name': name, 'label': str(item.get('label') or name)}
            )
        return cleaned


class CaseRecordSerializer(serializers.ModelSerializer):

    class Meta:
        model = CaseRecord
        fields = ('id', 'key', 'data', 'date_created', 'date_modified')
        read_only_fields = ('id', 'date_created', 'date_modified')

    def validate_data(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('`data` must be an object')
        return {str(k): ('' if v is None else str(v)) for k, v in value.items()}


class CaseLinkSerializer(serializers.ModelSerializer):

    case_table = serializers.SlugRelatedField(
        slug_field='uid', queryset=CaseTable.objects.all()
    )
    case_table_detail = CaseTableSerializer(source='case_table', read_only=True)
    asset = serializers.SlugRelatedField(slug_field='uid', read_only=True)
    asset_name = serializers.CharField(source='asset.name', read_only=True)

    class Meta:
        model = CaseLink
        fields = (
            'uid',
            'asset',
            'asset_name',
            'case_table',
            'case_table_detail',
            'filename',
            'case_id_xpath',
            'field_mappings',
            'write_back',
            'create_missing',
            'date_created',
            'date_modified',
        )
        read_only_fields = ('uid', 'date_created', 'date_modified')

    def validate_filename(self, value):
        value = value.strip()
        if not value.lower().endswith('.csv'):
            raise serializers.ValidationError(
                'The filename must end with `.csv` — forms reference it '
                "like a regular media file, e.g. pulldata('cases', …) "
                'for `cases.csv`'
            )
        if '/' in value or '\\' in value:
            raise serializers.ValidationError('Invalid filename')
        return value

    def validate_field_mappings(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError(
                '`field_mappings` must be an object mapping submission '
                'question names to case table columns'
            )
        return {
            str(k).strip(): str(v).strip()
            for k, v in value.items()
            if str(k).strip() and str(v).strip()
        }

    def validate_case_table(self, value):
        request = self.context.get('request')
        asset = self.context.get('asset')
        user = getattr(request, 'user', None)
        allowed_owners = {user}
        if asset is not None:
            allowed_owners.add(asset.owner)
        if value.owner in allowed_owners:
            return value
        # Tables shared with the requesting user's organization are also fine
        if (
            user is not None
            and CaseTable.objects.for_user(user).filter(pk=value.pk).exists()
        ):
            return value
        raise serializers.ValidationError(
            'You can only link case tables that you own, the project owner '
            'owns, or that are shared with your organization'
        )


class CaseEventSerializer(serializers.ModelSerializer):

    class Meta:
        model = CaseEvent
        fields = (
            'id',
            'record_key',
            'source',
            'action',
            'changes',
            'username',
            'asset_uid',
            'asset_name',
            'submission_id',
            'date_created',
        )
        read_only_fields = fields
