"""Read-only by default: compare policies over actual historical sessions."""

import json
from collections import Counter

from django.core.management.base import BaseCommand, CommandError

from programs.models import ProgramFolder
from workouts.models import WorkoutDay
from workouts.progression import analyze_workout, record_analysis
from workouts.recommendations import generate_recommendations_for_day


class Command(BaseCommand):
    help = "Replay progression policy without changing programs (optionally save audit reports)."

    def add_arguments(self, parser):
        parser.add_argument("--program-id", type=int, required=True)
        parser.add_argument("--limit", type=int, default=20)
        parser.add_argument("--save", action="store_true")

    def handle(self, *args, **options):
        program = ProgramFolder.objects.filter(pk=options["program_id"]).first()
        if not program or options["limit"] <= 0:
            raise CommandError("A valid program and positive limit are required")
        days = (
            WorkoutDay.objects.filter(
                user=program.user,
                set_logs__template_exercise__template__folder=program,
            )
            .distinct()
            .order_by("-date")[: options["limit"]]
        )
        modes = Counter()
        count = 0
        for day in days:
            legacy = [
                item
                for item in generate_recommendations_for_day(day)
                if item["folder_id"] == program.pk
            ]
            report = (
                record_analysis(day, program.pk, legacy=legacy)
                if options["save"]
                else analyze_workout(day, program.pk)
            )
            modes.update(decision["mode"] for decision in report["decisions"])
            self.stdout.write(
                json.dumps(
                    {"date": day.date.isoformat(), "legacy": legacy, **report},
                    ensure_ascii=False,
                )
            )
            count += 1
        self.stdout.write(
            json.dumps(
                {"sessions": count, "modes": modes, "programs_changed": 0},
                ensure_ascii=False,
            )
        )
