from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('kobo_cases', '0002_sharing_and_events'),
    ]

    operations = [
        migrations.RenameField(
            model_name='caselink',
            old_name='filename',
            new_name='_filename',
        ),
        migrations.AlterField(
            model_name='caselink',
            name='_filename',
            field=models.CharField(
                db_column='filename', default='cases.csv', max_length=255
            ),
        ),
        migrations.AlterUniqueTogether(
            name='caselink',
            unique_together={('asset', 'case_table'), ('asset', '_filename')},
        ),
    ]
