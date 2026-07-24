from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from mcp_gateway.models import (
    OAuthAuthorizationCode,
    OAuthAuthorizationRequest,
    OAuthTokenRecord,
)


class Command(BaseCommand):
    help = "Удаляет просроченное OAuth-состояние MCP."

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(days=7)
        request_count, _ = OAuthAuthorizationRequest.objects.filter(
            expires_at__lt=cutoff
        ).delete()
        code_count, _ = OAuthAuthorizationCode.objects.filter(
            expires_at__lt=cutoff
        ).delete()
        token_count, _ = OAuthTokenRecord.objects.filter(expires_at__lt=cutoff).delete()
        self.stdout.write(
            self.style.SUCCESS(
                f"Удалено: requests={request_count}, codes={code_count}, tokens={token_count}"
            )
        )
