from __future__ import annotations

from django.db.models import Q
from rest_framework import generics

from .models import CustomExercise, Exercise
from .serializers import CustomExerciseSerializer, ExerciseSerializer


class ExerciseListView(generics.ListAPIView):
    serializer_class = ExerciseSerializer

    def get_queryset(self):
        queryset = Exercise.objects.all()
        query = self.request.query_params.get("q")
        muscles = self.request.query_params.get("muscles")
        if query:
            queryset = queryset.filter(
                Q(name__icontains=query)
                | Q(description__icontains=query)
                | Q(english_name__icontains=query)
                | Q(target_muscles__icontains=query)
            )
        if muscles:
            queryset = queryset.filter(target_muscles__icontains=muscles)
        return queryset


class CustomExerciseListCreateView(generics.ListCreateAPIView):
    serializer_class = CustomExerciseSerializer

    def get_queryset(self):
        return CustomExercise.objects.filter(user=self.request.user)


class CustomExerciseDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CustomExerciseSerializer

    def get_queryset(self):
        return CustomExercise.objects.filter(user=self.request.user)

# Create your views here.
