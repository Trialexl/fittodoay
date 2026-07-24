from __future__ import annotations

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from workouts.models import (
    ExerciseImage,
    ExerciseInstruction,
    ExerciseMuscle,
    Exercise_DB,
)


class Command(BaseCommand):
    help = "Import exercises from docs/exercises/exercises_ru_all.json into Exercise_DB"

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            type=str,
            default=str(
                (
                    Path(__file__).resolve().parents[4]
                    / "docs"
                    / "exercises"
                    / "exercises_ru_all.json"
                )
            ),
            help="Path to exercises JSON file",
        )
        parser.add_argument(
            "--truncate",
            action="store_true",
            help="Delete existing catalog entries before import",
        )

    def handle(self, *args, **options):
        file_path = Path(options["file"])
        if not file_path.exists():
            raise CommandError(f"File {file_path} does not exist")
        with file_path.open() as fh:
            try:
                payload = json.load(fh)
            except json.JSONDecodeError as exc:
                raise CommandError(f"Failed to parse JSON: {exc}") from exc

        if not isinstance(payload, list):
            raise CommandError("JSON root must be a list of exercises")

        if options["truncate"]:
            self.stdout.write(self.style.WARNING("Truncating existing catalog..."))
            ExerciseImage.objects.all().delete()
            ExerciseInstruction.objects.all().delete()
            ExerciseMuscle.objects.all().delete()
            Exercise_DB.objects.all().delete()

        created = 0
        updated = 0

        with transaction.atomic():
            for entry in payload:
                exercise_id = entry.get("id") or entry.get("name")
                if not exercise_id:
                    self.stdout.write(
                        self.style.WARNING("Skipping entry without id or name")
                    )
                    continue
                defaults = self._build_defaults(entry)
                exercise, created_flag = Exercise_DB.objects.update_or_create(
                    id=exercise_id,
                    defaults=defaults,
                )
                self._sync_muscles(exercise, entry)
                self._sync_instructions(exercise, entry)
                self._sync_images(exercise, entry)
                if created_flag:
                    created += 1
                else:
                    updated += 1

        self.stdout.write(
            self.style.SUCCESS(f"Import finished: {created} created, {updated} updated")
        )

    def _build_defaults(self, entry: dict) -> dict:
        def num(value, cast=float):
            if value in (None, "", 0):
                return None
            try:
                return cast(value)
            except (ValueError, TypeError):
                return None

        def int_or_none(value):
            if value in (None, "", 0):
                return None
            try:
                return int(value)
            except (ValueError, TypeError):
                return None

        return {
            "name_en": entry.get("name") or entry.get("name_en") or "",
            "name_ru": entry.get("наименование")
            or entry.get("name_ru")
            or entry.get("name")
            or "",
            "force_en": entry.get("force") or entry.get("force_en") or "",
            "force_ru": entry.get("force_ru") or "",
            "level_en": entry.get("level") or entry.get("level_en") or "",
            "level_ru": entry.get("level_ru") or "",
            "mechanic_en": entry.get("mechanic") or entry.get("mechanic_en"),
            "mechanic_ru": entry.get("mechanic_ru"),
            "equipment_en": entry.get("equipment") or entry.get("equipment_en") or "",
            "equipment_ru": entry.get("equipment_ru") or "",
            "category_en": entry.get("category") or entry.get("category_en") or "",
            "category_ru": entry.get("category_ru") or "",
            "has_weight": bool(entry.get("has_weight", True)),
            "has_time": bool(entry.get("has_time", False)),
            "default_sets": int(entry.get("default_sets", 3) or 3),
            "default_reps": int(entry.get("default_reps", 10) or 10),
            "default_rest": int(entry.get("default_rest", 60) or 60),
            "default_time": int_or_none(entry.get("default_time")),
            "default_weight": num(entry.get("default_weight")),
            "rating": num(entry.get("rating"), cast=float),
        }

    def _sync_muscles(self, exercise: Exercise_DB, entry: dict):
        exercise.muscles.all().delete()
        primary_en = entry.get("primaryMuscles") or []
        primary_ru = entry.get("primaryMuscles_ru") or []
        secondary_en = entry.get("secondaryMuscles") or []
        secondary_ru = entry.get("secondaryMuscles_ru") or []

        for idx, name_en in enumerate(primary_en):
            name_ru = primary_ru[idx] if idx < len(primary_ru) else name_en
            ExerciseMuscle.objects.create(
                exercise=exercise,
                name_en=name_en,
                name_ru=name_ru,
                is_primary=True,
            )
        for idx, name_en in enumerate(secondary_en):
            name_ru = secondary_ru[idx] if idx < len(secondary_ru) else name_en
            ExerciseMuscle.objects.create(
                exercise=exercise,
                name_en=name_en,
                name_ru=name_ru,
                is_primary=False,
            )

    def _sync_instructions(self, exercise: Exercise_DB, entry: dict):
        exercise.instructions.all().delete()
        en_items = entry.get("instructions") or []
        ru_items = entry.get("инструкции") or []
        max_len = max(len(en_items), len(ru_items))
        for idx in range(max_len):
            text_en = en_items[idx] if idx < len(en_items) else ""
            text_ru = ru_items[idx] if idx < len(ru_items) else text_en
            ExerciseInstruction.objects.create(
                exercise=exercise,
                order=idx + 1,
                text_en=text_en,
                text_ru=text_ru,
            )

    def _sync_images(self, exercise: Exercise_DB, entry: dict):
        exercise.images.all().delete()
        for idx, path in enumerate(entry.get("images") or []):
            ExerciseImage.objects.create(
                exercise=exercise,
                order=idx + 1,
                path=path,
            )
