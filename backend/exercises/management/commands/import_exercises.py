from __future__ import annotations

import csv
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from exercises.models import Exercise


class Command(BaseCommand):
    help = "Import exercises from docs/exercise.csv into the Exercise model"

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            type=str,
            default=str((settings.BASE_DIR.parent / "docs" / "ex800.CSV").resolve()),
            help="Path to exercise CSV file",
        )
        parser.add_argument(
            "--truncate",
            action="store_true",
            help="Delete existing exercises before import",
        )

    def handle(self, *args, **options):
        file_path = Path(options["file"])
        if not file_path.exists():
            raise CommandError(f"File {file_path} does not exist")

        if options["truncate"]:
            Exercise.objects.all().delete()
            self.stdout.write(self.style.WARNING("Existing Exercise records deleted"))

        created = 0
        updated = 0
        with file_path.open() as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                name = row["Название"].strip()
                defaults = {
                    "description": row["Краткое описание"].strip(),
                    "target_muscles": row["Целевые мышцы"].strip(),
                    "default_weight": self._parse_decimal(row["Вес"]),
                    "default_time": self._parse_int(row["Время"]),
                    "default_reps": self._parse_int(row["Количество повторений"], fallback=0)
                    or 0,
                    "default_sets": self._parse_int(row["Количество подходов"], fallback=3) or 3,
                    "default_rest": self._parse_int(row["Время отдыха между повторениями"], 60)
                    or 60,
                    "rating": self._parse_decimal(row.get("Рейтинг упражнения", "")),
                    "english_name": (row.get("Оригинальное название на английском") or "").strip() or None,
                    "difficulty": (row.get("Сложность") or "").strip() or None,
                    "common_errors": (row.get("Частые ошибки") or "").strip() or None,
                }
                defaults["has_weight"] = bool(defaults["default_weight"])
                defaults["has_time"] = bool(defaults["default_time"])
                obj, created_flag = Exercise.objects.update_or_create(
                    name=name,
                    defaults=defaults,
                )
                if created_flag:
                    created += 1
                else:
                    updated += 1

        self.stdout.write(
            self.style.SUCCESS(f"Import finished: {created} created, {updated} updated")
        )

    def _parse_decimal(self, value: str):
        value = value.strip()
        if not value or value == "0":
            return None
        return float(value)

    def _parse_int(self, value: str, fallback: int | None = None):
        value = value.strip()
        if not value:
            return fallback
        try:
            return int(float(value))
        except ValueError:
            return fallback
