from __future__ import annotations

import time

from django.core.management.base import BaseCommand
from django.db import transaction

from workouts.models import TechniqueReview
from workouts.technique import TechniqueReviewAnalysisService


class Command(BaseCommand):
    help = "Process pending technique reviews"

    def add_arguments(self, parser):
        parser.add_argument(
            "--once",
            action="store_true",
            help="Process one batch and exit.",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=3,
            help="Maximum number of pending reviews to process per loop.",
        )
        parser.add_argument(
            "--sleep",
            type=float,
            default=3.0,
            help="Seconds to wait between empty polling loops.",
        )

    def handle(self, *args, **options):
        batch_size = max(int(options["batch_size"]), 1)
        sleep_seconds = max(float(options["sleep"]), 0.1)
        while True:
            processed = self._process_batch(batch_size)
            if options["once"]:
                self.stdout.write(f"Processed {processed} technique reviews")
                return
            if processed == 0:
                time.sleep(sleep_seconds)

    def _process_batch(self, batch_size: int) -> int:
        with transaction.atomic():
            pending_ids = list(
                TechniqueReview.objects.select_for_update(skip_locked=True)
                .filter(status=TechniqueReview.Status.PROCESSING)
                .order_by("created_at")
                .values_list("id", flat=True)[:batch_size]
            )

        for review_id in pending_ids:
            try:
                review = TechniqueReview.objects.get(id=review_id)
            except TechniqueReview.DoesNotExist:
                continue
            TechniqueReviewAnalysisService(review).analyze(
                forced_exercise=review.exercise
            )
        return len(pending_ids)
