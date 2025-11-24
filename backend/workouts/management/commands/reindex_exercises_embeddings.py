from __future__ import annotations

import logging
from django.core.management.base import BaseCommand

from pgvector.django import L2Distance

try:
    from sentence_transformers import SentenceTransformer
except ImportError:  # pragma: no cover - optional
    SentenceTransformer = None

from workouts.models import Exercise_DB

logger = logging.getLogger(__name__)


def build_model():
    if not SentenceTransformer:
        raise RuntimeError("sentence-transformers is not installed")
    return SentenceTransformer("sentence-transformers/paraphrase-MiniLM-L6-v2")


def encode_texts(model, texts):
    return model.encode(texts, normalize_embeddings=True)


class Command(BaseCommand):
    help = "Recompute embeddings for Exercise_DB to support vector search"

    def handle(self, *args, **options):
        if not SentenceTransformer:
            self.stderr.write("sentence-transformers not installed. Install and rerun.")
            return
        model = build_model()
        exercises = Exercise_DB.objects.all().order_by("id")
        payloads = []
        texts = []
        for ex in exercises:
            name = ex.name_ru or ex.name_en
            muscles = ex.target_muscles or ""
            payloads.append(ex)
            texts.append(f"{name}. Мышцы: {muscles}")
        embeddings = encode_texts(model, texts)
        updated = 0
        for ex, emb in zip(payloads, embeddings):
            ex.embedding = emb.tolist()
            updated += 1
        Exercise_DB.objects.bulk_update(payloads, ["embedding"])
        self.stdout.write(f"Updated embeddings for {updated} exercises")
