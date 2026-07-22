from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

import kobo.apps.kobo_cases.models
import kpi.fields.kpi_uid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('kpi', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='CaseTable',
            fields=[
                (
                    'id',
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                ('uid', kpi.fields.kpi_uid.KpiUidField(uid_prefix='ct', _null=False)),
                ('name', models.CharField(max_length=255)),
                ('key_column', models.CharField(default='case_id', max_length=64)),
                ('columns', models.JSONField(default=list)),
                (
                    'data_version',
                    models.CharField(
                        default=kobo.apps.kobo_cases.models.new_data_version,
                        max_length=32,
                    ),
                ),
                ('date_created', models.DateTimeField(auto_now_add=True)),
                ('date_modified', models.DateTimeField(auto_now=True)),
                (
                    'owner',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='case_tables',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                'ordering': ['-date_modified'],
            },
        ),
        migrations.CreateModel(
            name='CaseRecord',
            fields=[
                (
                    'id',
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                ('key', models.CharField(max_length=255)),
                ('data', models.JSONField(default=dict)),
                ('date_created', models.DateTimeField(auto_now_add=True)),
                ('date_modified', models.DateTimeField(auto_now=True)),
                (
                    'table',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='records',
                        to='kobo_cases.casetable',
                    ),
                ),
            ],
            options={
                'ordering': ['pk'],
                'unique_together': {('table', 'key')},
            },
        ),
        migrations.CreateModel(
            name='CaseLink',
            fields=[
                (
                    'id',
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                ('uid', kpi.fields.kpi_uid.KpiUidField(uid_prefix='cl', _null=False)),
                ('filename', models.CharField(default='cases.csv', max_length=255)),
                ('case_id_xpath', models.CharField(max_length=255)),
                ('field_mappings', models.JSONField(blank=True, default=dict)),
                ('write_back', models.BooleanField(default=True)),
                ('create_missing', models.BooleanField(default=True)),
                ('synced_with_backend', models.BooleanField(default=False)),
                ('date_created', models.DateTimeField(auto_now_add=True)),
                ('date_modified', models.DateTimeField(auto_now=True)),
                (
                    'asset',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='case_links',
                        to='kpi.asset',
                    ),
                ),
                (
                    'case_table',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='links',
                        to='kobo_cases.casetable',
                    ),
                ),
            ],
            options={
                'ordering': ['pk'],
                'unique_together': {('asset', 'case_table'), ('asset', 'filename')},
            },
        ),
    ]
