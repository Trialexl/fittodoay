from __future__ import annotations

from rest_framework import generics, serializers

from workouts.models import Exercise_DB

from .models import CustomExercise
from .search import search_catalog, ranked_queryset
from .serializers import CustomExerciseSerializer, ExerciseSerializer


class ExerciseListView(generics.ListAPIView):
    serializer_class = ExerciseSerializer

    def get_queryset(self):
        class Window(serializers.Serializer):
            limit = serializers.IntegerField(required=False, min_value=1, max_value=100)
            offset = serializers.IntegerField(
                required=False, default=0, min_value=0, max_value=10000
            )

        window = Window(data=self.request.query_params)
        window.is_valid(raise_exception=True)
        result = search_catalog(
            query=self.request.query_params.get("q", ""),
            muscles=self.request.query_params.get("muscles", ""),
            equipment=self.request.query_params.get("equipment", ""),
            primary_only=self.request.query_params.get("primary_only") == "true",
            limit=window.validated_data.get("limit"),
            offset=window.validated_data["offset"],
        )
        queryset = ranked_queryset(result)
        ordering = self.request.query_params.get("ordering")
        if ordering:
            direction = "-" if ordering.startswith("-") else ""
            field = ordering.lstrip("-")
            ordering_map = {
                "name": "name_ru",
                "name_ru": "name_ru",
                "name_en": "name_en",
            }
            if field in ordering_map:
                queryset = queryset.order_by(f"{direction}{ordering_map[field]}")
        return queryset.distinct()


class ExerciseDetailView(generics.RetrieveAPIView):
    serializer_class = ExerciseSerializer
    queryset = Exercise_DB.objects.all().prefetch_related(
        "muscles", "instructions", "images"
    )


class CustomExerciseListCreateView(generics.ListCreateAPIView):
    serializer_class = CustomExerciseSerializer

    def get_queryset(self):
        return CustomExercise.objects.filter(user=self.request.user)


class CustomExerciseDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CustomExerciseSerializer

    def get_queryset(self):
        return CustomExercise.objects.filter(user=self.request.user)


# Create your views here.
