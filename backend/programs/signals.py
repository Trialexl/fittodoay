from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import ProgramFolder


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_default_folder(sender, instance, created, **kwargs):
    if not created:
        return
    ProgramFolder.objects.get_or_create(
        user=instance,
        name="Основные",
        defaults={"comment": "Папка создана автоматически", "is_active": True, "sort_order": 0},
    )
