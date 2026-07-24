from __future__ import annotations

from datetime import date
from typing import Any, Literal

from asgiref.sync import sync_to_async
from django.contrib.auth import get_user_model
from django.db import transaction
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import BaseModel, Field, model_validator

from workouts.models import WorkoutDay, WorkoutSetLog
from workouts.serializers import WorkoutSetLogSerializer
from programs.models import TemplateExercise

from .api_proxy import api_request
from .oauth_provider import READ_SCOPE, WRITE_SCOPE
from .services import create_training_program as create_training_program_service

READ = ToolAnnotations(readOnlyHint=True, destructiveHint=False, openWorldHint=False)
WRITE = ToolAnnotations(
    readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False
)
UPSERT = ToolAnnotations(
    readOnlyHint=False, destructiveHint=False, idempotentHint=True, openWorldHint=False
)
DESTRUCTIVE = ToolAnnotations(
    readOnlyHint=False, destructiveHint=True, idempotentHint=True, openWorldHint=False
)


class TrainingExercise(BaseModel):
    exercise_id: str | None = None
    custom_exercise_id: int | None = None
    sort_order: int = Field(default=0, ge=0)
    weight_override: str | None = None
    rep_override: int | None = Field(default=None, ge=1)
    set_override: int | None = Field(default=None, ge=1)
    time_override: int | None = Field(default=None, ge=1)
    rest_override: int | None = Field(default=None, ge=0)
    note: str = Field(default="", max_length=255)
    is_active: bool = True

    @model_validator(mode="after")
    def exactly_one_source(self):
        if (self.exercise_id is None) == (self.custom_exercise_id is None):
            raise ValueError("Укажите ровно один источник упражнения")
        return self


class TrainingDay(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    comment: str = Field(default="", max_length=255)
    schedule_type: Literal["weekly", "biweekly", "interval", "custom"]
    schedule_config: dict[str, Any] = Field(default_factory=dict)
    sort_order: int = Field(default=0, ge=0)
    is_active: bool = True
    template_exercises: list[TrainingExercise] = Field(default_factory=list)


class RecommendationItem(BaseModel):
    template_exercise_id: int
    rep_override: int | None = Field(default=None, ge=1)
    weight_override: str | None = None

    @model_validator(mode="after")
    def at_least_one_value(self):
        if self.rep_override is None and self.weight_override is None:
            raise ValueError("Укажите повторения или вес")
        return self


def _identity(*, write: bool = False):
    token = get_access_token()
    if token is None or token.subject is None or token.resource is None:
        raise PermissionError("OAuth access token отсутствует")
    required = WRITE_SCOPE if write else READ_SCOPE
    if required not in token.scopes:
        raise PermissionError(f"Для операции требуется scope {required}")
    return {
        "user_id": int(token.subject),
        "client_id": token.client_id,
        "scopes": token.scopes,
        "resource": token.resource,
    }


async def _call(method: str, path: str, *, query=None, payload=None, write=False):
    return await api_request(
        **_identity(write=write),
        method=method,
        path=path,
        query=query,
        payload=payload,
    )


def register_domain_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        description="Получить фитнес-профиль текущего пользователя.", annotations=READ
    )
    async def get_profile() -> dict[str, Any]:
        return await _call("GET", "/api/profile/")

    @mcp.tool(
        description="Найти упражнения каталога по названию и мышцам.", annotations=READ
    )
    async def search_exercises(
        query: str | None = None,
        muscles: str | None = None,
        ordering: Literal["name", "-name"] | None = None,
    ) -> Any:
        return await _call(
            "GET",
            "/api/exercises/",
            query={"q": query, "muscles": muscles, "ordering": ordering},
        )

    @mcp.tool(
        description="Получить упражнение каталога по строковому ID.", annotations=READ
    )
    async def get_exercise(exercise_id: str) -> dict[str, Any]:
        return await _call("GET", f"/api/exercises/{exercise_id}/")

    @mcp.tool(
        description="Получить список собственных упражнений пользователя.",
        annotations=READ,
    )
    async def list_custom_exercises() -> Any:
        return await _call("GET", "/api/exercises/custom/")

    @mcp.tool(description="Получить собственное упражнение по ID.", annotations=READ)
    async def get_custom_exercise(custom_exercise_id: int) -> dict[str, Any]:
        return await _call("GET", f"/api/exercises/custom/{custom_exercise_id}/")

    @mcp.tool(
        description="Получить список тренировочных программ пользователя.",
        annotations=READ,
    )
    async def list_programs() -> Any:
        return await _call("GET", "/api/programs/folders/")

    @mcp.tool(description="Получить программу и все её дни.", annotations=READ)
    async def get_program(program_id: int) -> dict[str, Any]:
        program = await _call("GET", f"/api/programs/folders/{program_id}/")
        program["days"] = await _call(
            "GET", "/api/programs/templates/", query={"folder": program_id}
        )
        return program

    @mcp.tool(
        description="Получить дни программ, при необходимости одной программы.",
        annotations=READ,
    )
    async def list_day_templates(program_id: int | None = None) -> Any:
        return await _call(
            "GET", "/api/programs/templates/", query={"folder": program_id}
        )

    @mcp.tool(description="Получить день программы и его упражнения.", annotations=READ)
    async def get_day_template(day_template_id: int) -> dict[str, Any]:
        return await _call("GET", f"/api/programs/templates/{day_template_id}/")

    @mcp.tool(
        description="Получить план тренировки на дату ISO YYYY-MM-DD.", annotations=READ
    )
    async def get_workout_plan(workout_date: date) -> dict[str, Any]:
        return await _call(
            "GET", "/api/workouts/plan/", query={"date": workout_date.isoformat()}
        )

    @mcp.tool(description="Получить журнал подходов пользователя.", annotations=READ)
    async def list_workout_logs() -> Any:
        return await _call("GET", "/api/workouts/logs/")

    @mcp.tool(
        description="Получить историю веса за диапазон ISO-дат.", annotations=READ
    )
    async def get_body_weight_history(
        date_from: date | None = None, date_to: date | None = None
    ) -> Any:
        return await _call(
            "GET",
            "/api/analytics/body-weight/",
            query={
                "start": date_from.isoformat() if date_from else None,
                "end": date_to.isoformat() if date_to else None,
            },
        )

    @mcp.tool(description="Получить дневную тренировочную аналитику.", annotations=READ)
    async def get_daily_training_analytics(
        date_from: date | None = None, date_to: date | None = None
    ) -> Any:
        return await _call(
            "GET",
            "/api/analytics/days/",
            query={
                "start": date_from.isoformat() if date_from else None,
                "end": date_to.isoformat() if date_to else None,
            },
        )

    @mcp.tool(description="Получить аналитику упражнения по его ID.", annotations=READ)
    async def get_exercise_analytics(
        exercise_id: str,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> Any:
        result = await _call(
            "GET",
            "/api/analytics/exercises/",
            query={
                "start": date_from.isoformat() if date_from else None,
                "end": date_to.isoformat() if date_to else None,
            },
        )
        expected_ids = {exercise_id, f"sys:{exercise_id}", f"custom:{exercise_id}"}
        result["items"] = [
            item
            for item in result.get("items", [])
            if str(item.get("id")) in expected_ids
        ]
        return result

    @mcp.tool(
        description="Получить тренды по тренировочным программам.", annotations=READ
    )
    async def get_program_trends(
        period: Literal["week", "month", "half-year", "year"] = "month",
        granularity: Literal["day", "week"] = "day",
    ) -> Any:
        return await _call(
            "GET",
            "/api/analytics/program-trends/",
            query={"range": period, "granularity": granularity},
        )

    @mcp.tool(
        description="Получить рекомендации для тренировки на дату.", annotations=READ
    )
    async def get_workout_recommendations(workout_date: date) -> Any:
        return await _call(
            "GET",
            "/api/workouts/recommendations/",
            query={"date": workout_date.isoformat()},
        )

    @mcp.tool(description="Создать собственное упражнение.", annotations=WRITE)
    async def create_custom_exercise(
        name: str,
        description: str = "",
        target_muscles: str = "",
        has_weight: bool = True,
        has_time: bool = False,
        default_weight: str | None = None,
        default_time: int | None = None,
        default_reps: int = 10,
        default_sets: int = 3,
        default_rest: int = 60,
        base_exercise_id: str | None = None,
    ) -> dict[str, Any]:
        return await _call(
            "POST", "/api/exercises/custom/", payload=locals(), write=True
        )

    @mcp.tool(description="Изменить собственное упражнение.", annotations=WRITE)
    async def update_custom_exercise(
        custom_exercise_id: int,
        name: str | None = None,
        description: str | None = None,
        target_muscles: str | None = None,
        default_weight: str | None = None,
        default_time: int | None = None,
        default_reps: int | None = None,
        default_sets: int | None = None,
        default_rest: int | None = None,
    ) -> dict[str, Any]:
        payload = {key: value for key, value in locals().items() if value is not None}
        payload.pop("custom_exercise_id")
        return await _call(
            "PATCH",
            f"/api/exercises/custom/{custom_exercise_id}/",
            payload=payload,
            write=True,
        )

    @mcp.tool(description="Удалить собственное упражнение.", annotations=DESTRUCTIVE)
    async def delete_custom_exercise(custom_exercise_id: int) -> dict[str, Any]:
        await _call(
            "DELETE", f"/api/exercises/custom/{custom_exercise_id}/", write=True
        )
        return {"deleted_id": custom_exercise_id}

    @mcp.tool(description="Создать тренировочную программу.", annotations=WRITE)
    async def create_program(
        name: str, comment: str = "", is_active: bool = True, sort_order: int = 0
    ) -> dict[str, Any]:
        return await _call(
            "POST", "/api/programs/folders/", payload=locals(), write=True
        )

    @mcp.tool(description="Изменить тренировочную программу.", annotations=WRITE)
    async def update_program(
        program_id: int,
        name: str | None = None,
        comment: str | None = None,
        is_active: bool | None = None,
        sort_order: int | None = None,
    ) -> dict[str, Any]:
        payload = {key: value for key, value in locals().items() if value is not None}
        payload.pop("program_id")
        return await _call(
            "PATCH", f"/api/programs/folders/{program_id}/", payload=payload, write=True
        )

    @mcp.tool(
        description="Удалить программу вместе с её днями.", annotations=DESTRUCTIVE
    )
    async def delete_program(program_id: int) -> dict[str, Any]:
        await _call("DELETE", f"/api/programs/folders/{program_id}/", write=True)
        return {"deleted_id": program_id}

    @mcp.tool(description="Создать день в тренировочной программе.", annotations=WRITE)
    async def create_day_template(
        program_id: int,
        name: str,
        schedule_type: Literal["weekly", "biweekly", "interval", "custom"],
        schedule_config: dict[str, Any],
        comment: str = "",
        is_active: bool = True,
        sort_order: int = 0,
    ) -> dict[str, Any]:
        payload = dict(locals())
        payload["folder"] = payload.pop("program_id")
        return await _call(
            "POST", "/api/programs/templates/", payload=payload, write=True
        )

    @mcp.tool(description="Изменить день тренировочной программы.", annotations=WRITE)
    async def update_day_template(
        day_template_id: int,
        name: str | None = None,
        comment: str | None = None,
        is_active: bool | None = None,
        schedule_type: (
            Literal["weekly", "biweekly", "interval", "custom"] | None
        ) = None,
        schedule_config: dict[str, Any] | None = None,
        sort_order: int | None = None,
    ) -> dict[str, Any]:
        payload = {key: value for key, value in locals().items() if value is not None}
        payload.pop("day_template_id")
        return await _call(
            "PATCH",
            f"/api/programs/templates/{day_template_id}/",
            payload=payload,
            write=True,
        )

    @mcp.tool(
        description="Удалить день и все упражнения в нём.", annotations=DESTRUCTIVE
    )
    async def delete_day_template(day_template_id: int) -> dict[str, Any]:
        await _call("DELETE", f"/api/programs/templates/{day_template_id}/", write=True)
        return {"deleted_id": day_template_id}

    @mcp.tool(
        description="Добавить упражнение в день; укажите ровно один источник.",
        annotations=WRITE,
    )
    async def add_template_exercise(
        day_template_id: int,
        exercise_id: str | None = None,
        custom_exercise_id: int | None = None,
        sort_order: int = 0,
        weight_override: str | None = None,
        rep_override: int | None = None,
        set_override: int | None = None,
        time_override: int | None = None,
        rest_override: int | None = None,
        note: str = "",
    ) -> dict[str, Any]:
        item = TrainingExercise(
            **{k: v for k, v in locals().items() if k != "day_template_id"}
        )
        return await _call(
            "POST",
            "/api/programs/template-exercises/",
            payload={"template": day_template_id, **item.model_dump()},
            write=True,
        )

    @mcp.tool(description="Изменить параметры упражнения в дне.", annotations=WRITE)
    async def update_template_exercise(
        template_exercise_id: int,
        weight_override: str | None = None,
        rep_override: int | None = None,
        set_override: int | None = None,
        time_override: int | None = None,
        rest_override: int | None = None,
        note: str | None = None,
        is_active: bool | None = None,
    ) -> dict[str, Any]:
        payload = {key: value for key, value in locals().items() if value is not None}
        payload.pop("template_exercise_id")
        return await _call(
            "PATCH",
            f"/api/programs/template-exercises/{template_exercise_id}/",
            payload=payload,
            write=True,
        )

    @mcp.tool(description="Удалить упражнение из дня.", annotations=DESTRUCTIVE)
    async def remove_template_exercise(template_exercise_id: int) -> dict[str, Any]:
        await _call(
            "DELETE",
            f"/api/programs/template-exercises/{template_exercise_id}/",
            write=True,
        )
        return {"deleted_id": template_exercise_id}

    @mcp.tool(
        description="Полностью заменить порядок упражнений дня.",
        annotations=DESTRUCTIVE,
    )
    async def reorder_template_exercises(
        day_template_id: int, ordered_template_exercise_ids: list[int]
    ) -> Any:
        await _call(
            "POST",
            "/api/programs/template-exercises/reorder/",
            payload={
                "template": day_template_id,
                "order": ordered_template_exercise_ids,
            },
            write=True,
        )
        return await _call(
            "GET",
            "/api/programs/template-exercises/",
            query={"template": day_template_id},
        )

    @mcp.tool(
        description="Атомарно создать программу, дни и упражнения с защитой от повтора.",
        annotations=WRITE,
    )
    async def create_training_program(
        idempotency_key: str,
        name: str,
        days: list[TrainingDay],
        comment: str = "",
        is_active: bool = True,
        sort_order: int = 0,
    ) -> dict[str, Any]:
        identity = _identity(write=True)
        user = await get_user_model().objects.aget(pk=identity["user_id"])
        payload = {
            "name": name,
            "comment": comment,
            "is_active": is_active,
            "sort_order": sort_order,
            "days": [day.model_dump() for day in days],
        }
        return await sync_to_async(create_training_program_service)(
            user=user, payload=payload, idempotency_key=idempotency_key
        )

    @mcp.tool(
        description="Создать или обновить конкретный подход без дублей.",
        annotations=UPSERT,
    )
    async def log_workout_set(
        workout_date: date,
        template_exercise_id: int,
        set_index: int,
        actual_reps: int | None = None,
        actual_weight: str | None = None,
        actual_time: int | None = None,
    ) -> dict[str, Any]:
        identity = _identity(write=True)
        return await sync_to_async(_upsert_workout_set)(
            user_id=identity["user_id"],
            workout_date=workout_date,
            template_exercise_id=template_exercise_id,
            set_index=set_index,
            actual_reps=actual_reps,
            actual_weight=actual_weight,
            actual_time=actual_time,
        )

    @mcp.tool(
        description="Создать или обновить взвешивание на дату.", annotations=UPSERT
    )
    async def upsert_weigh_in(
        weight_kg: str, weigh_in_date: date, note: str = ""
    ) -> dict[str, Any]:
        return await _call(
            "PUT",
            "/api/workouts/weigh-in/",
            payload={
                "date": weigh_in_date.isoformat(),
                "weight_kg": weight_kg,
                "note": note,
            },
            write=True,
        )

    @mcp.tool(
        description="Применить выбранные рекомендации к упражнениям программы.",
        annotations=DESTRUCTIVE,
    )
    async def apply_workout_recommendations(
        items: list[RecommendationItem],
    ) -> dict[str, Any]:
        return await _call(
            "POST",
            "/api/workouts/recommendations/apply/",
            payload={"items": [item.model_dump() for item in items]},
            write=True,
        )


@transaction.atomic
def _upsert_workout_set(
    *,
    user_id: int,
    workout_date: date,
    template_exercise_id: int,
    set_index: int,
    actual_reps: int | None,
    actual_weight: str | None,
    actual_time: int | None,
) -> dict[str, Any]:
    template_exercise = TemplateExercise.objects.filter(
        pk=template_exercise_id, template__folder__user_id=user_id
    ).first()
    if template_exercise is None:
        raise ValueError("Упражнение дня не найдено")
    day, _ = WorkoutDay.objects.get_or_create(user_id=user_id, date=workout_date)
    log, _ = WorkoutSetLog.objects.update_or_create(
        workout_day=day,
        template_exercise=template_exercise,
        set_index=set_index,
        defaults={
            "actual_reps": actual_reps,
            "actual_weight": actual_weight,
            "actual_time": actual_time,
        },
    )
    return WorkoutSetLogSerializer(log).data
