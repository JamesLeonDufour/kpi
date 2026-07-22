from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import CaseLink


@receiver(post_delete, sender=CaseLink)
def resync_media_on_link_delete(sender, instance, **kwargs):
    """
    When a link is removed, run a media sync on its project so the CSV
    entry is withdrawn from the form's manifest.
    """
    from kpi.models.asset_file import AssetFile
    from kpi.utils.log import logging

    asset = instance.asset
    try:
        if asset.has_deployment:
            asset.deployment.sync_media_files(AssetFile.PAIRED_DATA)
    except Exception as e:
        logging.error(
            f'resync_media_on_link_delete failed for {asset.uid}: {e}',
            exc_info=True,
        )
