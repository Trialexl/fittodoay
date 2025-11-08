from __future__ import annotations

from datetime import date

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
