from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('kobo_cases', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='casetable',
            name='share_with_org',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='CaseEvent',
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
                ('record_key', models.CharField(blank=True, default='', max_length=255)),
                (
                    'source',
                    models.CharField(
                        choices=[
                            ('manual', 'manual'),
                            ('upload', 'upload'),
                            ('submission', 'submission'),
                            ('api', 'api'),
                        ],
                        max_length=16,
                    ),
                ),
                ('action', models.CharField(max_length=16)),
                ('changes', models.JSONField(blank=True, default=dict)),
                ('username', models.CharField(blank=True, default='', max_length=150)),
                ('asset_uid', models.CharField(blank=True, default='', max_length=32)),
                ('asset_name', models.CharField(blank=True, default='', max_length=255)),
                ('submission_id', models.IntegerField(blank=True, null=True)),
                ('date_created', models.DateTimeField(auto_now_add=True)),
                (
                    'table',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='events',
                        to='kobo_cases.casetable',
                    ),
                ),
            ],
            options={
                'ordering': ['-pk'],
            },
        ),
        migrations.AddIndex(
            model_name='caseevent',
            index=models.Index(
                fields=['table', 'record_key'],
                name='kobo_cases_table_key_idx',
            ),
        ),
    ]
