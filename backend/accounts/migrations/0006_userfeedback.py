from django.db import migrations, models
import django.db.models.deletion


def create_feedback_model(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    # No data migration needed; placeholder to ensure FK resolves

class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_userprofile_llm_preferences'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserFeedback',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('message', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='feedback', to='accounts.user')),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
