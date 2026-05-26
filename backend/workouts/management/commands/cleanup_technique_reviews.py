from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from workouts.models import TechniqueReview


class Command(BaseCommand):
    help = "Delete old technique review records and their uploaded videos"

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=getattr(settings, "TECHNIQUE_VIDEO_RETENTION_DAYS", 30),
            help="Delete technique reviews older than this many days.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print how many reviews would be deleted without deleting anything.",
        )

    def handle(self, *args, **options):
        days = max(int(options["days"]), 1)
        cutoff = timezone.now() - timezone.timedelta(days=days)
        reviews = TechniqueReview.objects.filter(created_at__lt=cutoff)
        count = reviews.count()
        if options["dry_run"]:
            self.stdout.write(f"Would delete {count} technique reviews older than {days} days")
            return

        deleted_files = 0
        for review in reviews.iterator():
            video_file = review.video_file
            review.delete()
            if video_file:
                video_file.delete(save=False)
                deleted_files += 1
        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted {count} technique reviews and {deleted_files} video files"
            )
        )
