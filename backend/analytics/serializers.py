from __future__ import annotations

from datetime import date, timedelta

from rest_framework import serializers


class DateRangeSerializer(serializers.Serializer):
    start = serializers.DateField(required=False)
    end = serializers.DateField(required=False)

    def get_range(self):
        if not self.is_valid():
            raise serializers.ValidationError(self.errors)
        start = self.validated_data.get("start") or date.today().replace(day=1)
        end = self.validated_data.get("end") or date.today()
        if start > end:
            raise serializers.ValidationError("Дата начала не может быть позже даты окончания")
        return start, end


class TrendRangeSerializer(serializers.Serializer):
    RANGE_CHOICES = (
        ("week", "7 дней"),
        ("month", "30 дней"),
        ("half-year", "180 дней"),
        ("year", "365 дней"),
    )
    GRANULARITY_CHOICES = (("day", "По дням"), ("week", "По неделям"))

    range = serializers.ChoiceField(choices=RANGE_CHOICES, default="month")
    granularity = serializers.ChoiceField(choices=GRANULARITY_CHOICES, default="day")

    def get_range(self):
        if not self.is_valid():
            raise serializers.ValidationError(self.errors)
        selection = self.validated_data.get("range", "month")
        end = date.today()
        mapping = {
            "week": 6,
            "month": 29,
            "half-year": 179,
            "year": 364,
        }
        days = mapping.get(selection, 29)
        start = end - timedelta(days=days)
        return start, end
