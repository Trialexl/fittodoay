import json
from django.core.management.base import BaseCommand
from exercises.search import catalog_card, search_catalog
from workouts.models import Exercise_DB

CASES = [
    ("жим гантелей лежа", "Dumbbell_Bench_Press"),
    ("тяга гантели одной рукой в наклоне", "One-Arm_Dumbbell_Row"),
    ("подтягивания на перекладине", "Pullups"),
    ("планка", "Plank"),
    ("шраги с гантелями", "Dumbbell_Shrug"),
]


class Command(BaseCommand):
    help = "Read-only catalogue quality and search regression report (no LLM calls)"

    def handle(self, *args, **options):
        warnings = []
        for exercise in Exercise_DB.objects.all().prefetch_related("muscles"):
            card = catalog_card(exercise)
            reasons = list(card["metadata_warnings"])
            if not card["primary_muscles"]:
                reasons.append("primary_muscles_missing")
            if not card["equipment"]:
                reasons.append("equipment_unknown")
            if reasons:
                warnings.append(
                    {"id": exercise.pk, "name": card["name"], "reasons": reasons}
                )
        checks = []
        for query, expected in CASES:
            result = search_catalog(query=query, limit=5)
            ids = [item.pk for item in result.exercises]
            checks.append(
                {
                    "query": query,
                    "expected": expected,
                    "expected_present_in_catalog": Exercise_DB.objects.filter(
                        pk=expected
                    ).exists(),
                    "found_in_top5": expected in ids,
                    "top5": ids,
                }
            )
        self.stdout.write(
            json.dumps(
                {
                    "catalog_count": Exercise_DB.objects.count(),
                    "search_checks": checks,
                    "recall_at_5": sum(item["found_in_top5"] for item in checks)
                    / len(checks),
                    "metadata_warnings": warnings,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
