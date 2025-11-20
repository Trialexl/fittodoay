from __future__ import annotations

from django.db.models import Q, Value
from django.db.models.functions import Coalesce
from rest_framework import generics

from workouts.models import Exercise_DB

from .models import CustomExercise
from .serializers import CustomExerciseSerializer, ExerciseSerializer


class ExerciseListView(generics.ListAPIView):
    serializer_class = ExerciseSerializer

    def get_queryset(self):
        queryset = (
            Exercise_DB.objects.all()
            .prefetch_related("muscles", "instructions")
            .annotate(annotated_name=Coalesce("name_ru", "name_en", Value("")))
        )
        query = self.request.query_params.get("q")
        muscles = self.request.query_params.get("muscles")
        if query:
            queryset = queryset.filter(
                Q(name_ru__icontains=query)
                | Q(name_en__icontains=query)
                | Q(category_ru__icontains=query)
                | Q(category_en__icontains=query)
            )
        if muscles:
            queryset = queryset.filter(
                Q(muscles__name_ru__icontains=muscles)
                | Q(muscles__name_en__icontains=muscles)
            )
        ordering = self.request.query_params.get("ordering")
        if ordering:
            direction = "-" if ordering.startswith("-") else ""
            field = ordering.lstrip("-")
            ordering_map = {
                "name": "annotated_name",
                "name_ru": "name_ru",
                "name_en": "name_en",
            }
            if field in ordering_map:
                queryset = queryset.order_by(f"{direction}{ordering_map[field]}")
        return queryset.distinct()


class CustomExerciseListCreateView(generics.ListCreateAPIView):
    serializer_class = CustomExerciseSerializer

    def get_queryset(self):
        return CustomExercise.objects.filter(user=self.request.user)


class CustomExerciseDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CustomExerciseSerializer

    def get_queryset(self):
        return CustomExercise.objects.filter(user=self.request.user)

# Create your views here.
