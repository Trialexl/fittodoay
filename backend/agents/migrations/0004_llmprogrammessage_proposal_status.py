from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0003_llmprogramthread_llmprogrammessage"),
    ]

    operations = [
        migrations.AddField(
            model_name="llmprogrammessage",
            name="proposal_status",
            field=models.CharField(
                choices=[
                    ("none", "None"),
                    ("pending", "Pending"),
                    ("applied", "Applied"),
                    ("cancelled", "Cancelled"),
                ],
                default="none",
                max_length=16,
            ),
        ),
    ]
