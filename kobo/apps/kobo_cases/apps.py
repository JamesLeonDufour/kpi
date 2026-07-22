from django.apps import AppConfig


class KoboCasesAppConfig(AppConfig):
    name = 'kobo.apps.kobo_cases'
    verbose_name = 'Case management'

    def ready(self):
        # Makes sure all signal handlers are connected
        from kobo.apps.kobo_cases import signals  # noqa

        super().ready()
