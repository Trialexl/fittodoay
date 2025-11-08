from django.conf import settings
from django.db import migrations


def create_default_folders(apps, schema_editor):
    ProgramFolder = apps.get_model("programs", "ProgramFolder")
    User = apps.get_model(settings.AUTH_USER_MODEL.split(".")[0], settings.AUTH_USER_MODEL.split(".")[1])
    for user in User.objects.all():
        ProgramFolder.objects.get_or_create(
            user=user,
            name="Основные",
            defaults={"comment": "Папка создана автоматически", "is_active": True, "sort_order": 0},
        )


class Migration(migrations.Migration):
    dependencies = [
        ("programs", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(create_default_folders, migrations.RunPython.noop),
    ]
