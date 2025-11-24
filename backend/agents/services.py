from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, List

import httpx
from django.db import models, transaction

from django.utils import timezone

from programs.models import DayTemplate, ProgramFolder, TemplateExercise
from agents.models import LLMRequestLog, LLMProgramMessage, LLMProgramThread
from workouts.models import Exercise_DB, ExerciseMuscle
from pgvector.django import L2Distance

logger = logging.getLogger(__name__)

FALLBACK_MESSAGE = (
    "На данный момент создание через помощника недоступно. "
    "Можете попробовать позже или создать программу вручную."
)


class LLMServiceError(Exception):
    pass


class LLMUnavailableError(LLMServiceError):
    pass


class LLMInvalidResponse(LLMServiceError):
    pass


@dataclass
class LLMConfig:
    api_key: str | None
    model: str
    base_url: str
    referrer: str | None
    app_name: str | None

    @classmethod
    def load(cls) -> "LLMConfig":
        return cls(
            api_key=os.environ.get("OPENROUTER_API_KEY"),
            model=os.environ.get("OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet"),
            base_url=os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
            referrer=os.environ.get("OPENROUTER_REFERRER"),
            app_name=os.environ.get("OPENROUTER_APP_NAME", "fitTODOay"),
        )


class OpenRouterClient:
    def __init__(self, config: LLMConfig | None = None):
        self.config = config or LLMConfig.load()
        if not self.config.api_key:
            raise LLMUnavailableError("OpenRouter API key is missing")

    def create_chat_completion(self, messages: List[Dict[str, Any]]) -> str:
        url = self._compose_url("/chat/completions")
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
        }
        if self.config.referrer:
            headers["HTTP-Referer"] = self.config.referrer
        if self.config.app_name:
            headers["X-Title"] = self.config.app_name
        payload = {
            "model": self.config.model,
            "response_format": {"type": "json_object"},
            "messages": messages,
        }
        timeout = httpx.Timeout(connect=10.0, read=20.0, write=20.0, pool=None)
        try:
            response = httpx.post(url, json=payload, headers=headers, timeout=timeout)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "LLM request failed (%s): %s",
                exc.response.status_code,
                exc.response.text[:500],
            )
            raise LLMUnavailableError("openrouter_request_failed") from exc
        except httpx.TimeoutException as exc:
            logger.warning("LLM request timeout: %s", exc)
            raise LLMUnavailableError("openrouter_timeout") from exc
        except httpx.HTTPError as exc:
            logger.exception("LLM request failed: %s", exc)
            raise LLMUnavailableError("openrouter_request_failed") from exc
        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            raise LLMInvalidResponse("no choices in response")
        content = choices[0]["message"]["content"]
        return content

    def _compose_url(self, path: str) -> str:
        base = self.config.base_url.rstrip("/")
        return f"{base}{path}"


class LLMProgramGenerationService:
    prompt_fields = {
        "gender",
        "age",
        "weight_kg",
        "height_cm",
        "goal",
        "sessions_per_week",
        "session_duration",
        "notes",
    }

    def __init__(self, user, *, max_attempts: int = 2):
        self.user = user
        self.max_attempts = max(max_attempts, 1)

    def generate(self, preferences: Dict[str, Any]):
        exercises_snapshot = self._serialize_exercises()
        constraints = self._build_constraints()
        base_messages = self._build_messages(
            self._filter_prompt_preferences(preferences), exercises_snapshot, constraints
        )

        last_error: Exception | None = None
        for attempt in range(1, self.max_attempts + 1):
            messages = base_messages if attempt == 1 else [*base_messages, self._retry_instruction(attempt)]
            try:
                raw_text = self._call_llm(messages)
                plan = self._parse_plan(raw_text)
                result = self._persist_plan(plan)
                self._log_request(
                    payload=messages,
                    response=plan,
                    success=True,
                    status="ok",
                )
                return result
            except LLMInvalidResponse as exc:
                last_error = exc
                logger.warning(
                    "LLM invalid response attempt %s/%s for user %s: %s",
                    attempt,
                    self.max_attempts,
                    self.user.id,
                    exc,
                )
        status_code = getattr(last_error, "args", ["invalid_response"])[0] if last_error else "invalid_response"
        self._log_request(
            payload=base_messages,
            response=None,
            success=False,
            status=status_code,
            error=str(last_error) if last_error else None,
        )
        if last_error:
            raise last_error
        raise LLMInvalidResponse("invalid_response")

    def _serialize_exercises(self) -> List[Dict[str, Any]]:
        qs = Exercise_DB.objects.all().order_by("id")
        primary_muscles = ExerciseMuscle.objects.filter(is_primary=True).order_by("name_en")
        muscle_map: dict[str, list[str]] = {}
        for muscle in primary_muscles.values("exercise_id", "name_en"):
            muscle_map.setdefault(muscle["exercise_id"], []).append(muscle["name_en"])

        snapshot: List[Dict[str, Any]] = []
        for exercise in qs:
            snapshot.append(
                {
                    "id": exercise.id,
                    "name": exercise.english_name or exercise.name_en or exercise.name_ru,
                    "target_muscles": "/".join(muscle_map.get(exercise.id, [])),
                    "equipment": exercise.equipment_en or exercise.equipment_ru,
                    "difficulty": exercise.level_en or exercise.level_ru,
                    "has_weight": exercise.has_weight,
                    "has_time": exercise.has_time,
                }
            )
        return snapshot

    def _build_constraints(self) -> Dict[str, int]:
        return {
            "min_programs": 1,
            "max_programs": 1,
            "min_days_per_program": 1,
            "max_days_per_program": 5,
            "max_exercises_per_day": 8,
        }

    def _build_messages(self, preferences, exercises_snapshot, constraints):
        system_prompt = (
            "You are a fitness coach assistant. Build exactly one workout program using only the provided exercise catalog. "
            "Respond ONLY with a valid JSON object (no Markdown). JSON must start with '{' and end with '}'.\n"
            "Important: all names and comments for programs and day templates MUST be in Russian (Cyrillic).\n"
            "Schema:\n"
            "{\"programs\": [{\"name\": string, \"comment\": string?, \"days\": ["
            "{\"name\": string, \"comment\": string?, "
            "\"schedule_type\": \"weekly\", \"schedule_config\": {\"days_of_week\": [int]}, "
            "\"exercises\": [{"
            "\"exercise_id\": string, \"sets\": int, \"reps\": int|null, \"weight\": number|null, "
            "\"time\": int|null, \"rest\": int|null, \"note\": string?\n"
            "}]}]}]}\n"
            "Rules: use only catalog exercise IDs, determine appropriate sets/reps/weight/time yourself, keep numeric values numbers or null, "
            "and shorten days/exercises/comments if the response becomes too long."
        )
        user_content = {
            "preferences": preferences,
            "available_exercises": exercises_snapshot,
            "constraints": constraints,
        }
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_content, ensure_ascii=False)},
        ]

    def _filter_prompt_preferences(self, preferences: Dict[str, Any]) -> Dict[str, Any]:
        return {
            key: value
            for key, value in (preferences or {}).items()
            if key in self.prompt_fields and value is not None
        }

    def _retry_instruction(self, attempt_number: int) -> Dict[str, Any]:
        return {
            "role": "user",
            "content": (
                f"Ответ попытки #{attempt_number - 1} оказался невалидным JSON. "
                "Пожалуйста, отправь строго валидный JSON без Markdown. Если объём слишком большой, уменьши число дней "
                "или упражнений, сделай комментарии короче, но сохрани грамотный план."
            ),
        }

    def _call_llm(self, messages):
        try:
            client = OpenRouterClient()
            return client.create_chat_completion(messages)
        except LLMServiceError as exc:
            self._log_request(
                payload=messages,
                response=None,
                success=False,
                status=getattr(exc, "args", ["service_error"])[0],
                error=str(exc),
            )
            raise
        except Exception as exc:  # pragma: no cover - unforeseen errors
            logger.exception("Unexpected LLM error: %s", exc)
            self._log_request(
                payload=messages,
                response=None,
                success=False,
                status="unexpected_error",
                error=str(exc),
            )
            raise LLMUnavailableError("unexpected_error") from exc

    def _parse_plan(self, raw_text: str) -> Dict[str, Any]:
        cleaned = raw_text.strip()
        if cleaned.startswith("```"):
            # Remove optional markdown fences
            cleaned = cleaned.strip("`")
            cleaned = cleaned.replace("json", "", 1).strip()
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.warning("LLM returned invalid JSON: %s (raw=%s)", exc, raw_text[:2000])
            raise LLMInvalidResponse("invalid_json") from exc
        programs = data.get("programs")
        if not programs:
            raise LLMInvalidResponse("programs_missing")
        return data

    @transaction.atomic
    def _persist_plan(self, plan: Dict[str, Any]) -> Dict[str, Any]:
        created_programs = []
        programs_spec = plan["programs"]
        for idx, program in enumerate(programs_spec):
            folder = ProgramFolder.objects.create(
                user=self.user,
                name=self._unique_folder_name(program.get("name") or f"Программа {idx + 1}"),
                comment=program.get("comment", ""),
                is_active=idx == 0,
                sort_order=self.user.program_folders.count(),
            )
            for day_index, day in enumerate(program.get("days", [])):
                template = DayTemplate.objects.create(
                    folder=folder,
                    name=day.get("name") or f"День {day_index + 1}",
                    comment=day.get("comment", ""),
                    is_active=True,
                    schedule_type=day.get("schedule_type", DayTemplate.ScheduleType.WEEKLY),
                    schedule_config=day.get("schedule_config") or {"days_of_week": [day_index % 7]},
                    sort_order=day_index,
                )
                for order, exercise_entry in enumerate(day.get("exercises", [])):
                    exercise_obj = Exercise_DB.objects.filter(
                        id=exercise_entry.get("exercise_id")
                    ).first()
                    if not exercise_obj:
                        continue
                    TemplateExercise.objects.create(
                        template=template,
                        exercise=exercise_obj,
                        sort_order=order,
                        set_override=exercise_entry.get("sets"),
                        rep_override=exercise_entry.get("reps"),
                        weight_override=exercise_entry.get("weight"),
                        time_override=exercise_entry.get("time"),
                        rest_override=exercise_entry.get("rest"),
                        note=exercise_entry.get("note", ""),
                    )
            created_programs.append(
                {
                    "id": folder.id,
                    "name": folder.name,
                    "templates": folder.templates.count(),
                    "is_active": folder.is_active,
                }
            )
        if not created_programs:
            raise LLMInvalidResponse("nothing_was_created")
        return {
            "created_programs": created_programs,
            "active_program_id": created_programs[0]["id"],
            "raw_plan": plan,
        }

    def _unique_folder_name(self, base_name: str) -> str:
        name = base_name
        counter = 1
        while ProgramFolder.objects.filter(user=self.user, name=name).exists():
            counter += 1
            name = f"{base_name} ({counter})"
        return name

    def _log_request(self, *, payload, response, success: bool, status: str, error: str | None = None):
        try:
            LLMRequestLog.objects.create(
                user=self.user,
                payload=payload,
                response=response,
                status=status,
                success=success,
                error_message=error or "",
                created_at=timezone.now(),
            )
        except Exception:  # pragma: no cover - лог безопасный
            logger.exception("Failed to log LLM request")


class LLMProgramChatService:
    """Диалог по программе с предложением действий без немедленного применения."""

    def __init__(self, thread: LLMProgramThread):
        self.thread = thread

    def send(self, user_message: str) -> LLMProgramMessage:
        """Сохраняет сообщение пользователя, дергает LLM (текстовый ответ), сохраняет ответ."""
        LLMProgramMessage.objects.create(
            thread=self.thread, role=LLMProgramMessage.Role.USER, content=user_message
        )
        payload = self._build_messages(user_message, mode="chat")
        raw = self._call_llm(payload)
        parsed = self._parse_chat_response(raw)
        assistant_msg = LLMProgramMessage.objects.create(
            thread=self.thread,
            role=LLMProgramMessage.Role.ASSISTANT,
            content=parsed.get("assistant_reply", ""),
            actions=parsed.get("actions"),
        )
        self.thread.updated_at = timezone.now()
        self.thread.save(update_fields=["updated_at"])
        return assistant_msg

    def apply_latest_actions(self):
        """Получает (или генерирует) actions и применяет их к программе."""
        last_assistant = (
            self.thread.messages.filter(role=LLMProgramMessage.Role.ASSISTANT).order_by("-id").first()
        )
        actions = last_assistant.actions if last_assistant and last_assistant.actions else None
        if not actions:
            actions = self._generate_actions()
            LLMProgramMessage.objects.create(
                thread=self.thread,
                role=LLMProgramMessage.Role.ASSISTANT,
                content="Применяю согласованные изменения.",
                actions=actions,
            )
        if not actions:
            raise LLMInvalidResponse("no_actions_to_apply")
        with transaction.atomic():
            results = []
            for action in actions:
                result = self._apply_action(action)
                results.append(result)
        return results

    def _apply_action(self, action: Dict[str, Any]) -> Dict[str, Any]:
        action_type = action.get("type")
        if action_type == "add_exercise":
            return self._add_exercise(action)
        if action_type == "replace_exercise":
            return self._replace_exercise(action)
        if action_type == "update_weight":
            return self._update_weight(action)
        raise LLMInvalidResponse(f"unknown_action_{action_type}")

    def _add_exercise(self, action: Dict[str, Any]) -> Dict[str, Any]:
        day = self._resolve_day(action)
        exercise = self._resolve_exercise(action)
        if not day or not exercise:
            raise LLMInvalidResponse(
                "add_exercise requires valid day_id/day_name and exercise_id/exercise_name"
            )
        sort_order = (day.template_exercises.aggregate(models.Max("sort_order")).get("sort_order__max") or 0) + 1
        new_te = TemplateExercise.objects.create(
            template=day,
            exercise=exercise,
            custom_exercise=None,
            sort_order=sort_order,
            set_override=action.get("sets"),
            rep_override=action.get("reps"),
            weight_override=action.get("weight"),
            time_override=action.get("time"),
            rest_override=action.get("rest"),
            note=action.get("note") or "",
            is_active=True,
        )
        return {"type": "add_exercise", "template_exercise_id": new_te.id}

    def _replace_exercise(self, action: Dict[str, Any]) -> Dict[str, Any]:
        deactivate_id = action.get("deactivate_exercise_id")
        old_te = TemplateExercise.objects.filter(
            id=deactivate_id,
            template__folder=self.thread.program,
            template__folder__user=self.thread.user,
        ).first()
        day = self._resolve_day(action, fallback_from_te=deactivate_id)
        exercise = self._resolve_exercise(action)
        if not old_te or not day or not exercise:
            raise LLMInvalidResponse(
                "replace_exercise requires valid deactivate_exercise_id, day_id/day_name and exercise_id/exercise_name"
            )
        old_te.is_active = False
        old_te.save(update_fields=["is_active"])
        sort_order = (day.template_exercises.aggregate(models.Max("sort_order")).get("sort_order__max") or 0) + 1
        new_te = TemplateExercise.objects.create(
            template=day,
            exercise=exercise,
            sort_order=sort_order,
            set_override=action.get("sets"),
            rep_override=action.get("reps"),
            weight_override=action.get("weight"),
            time_override=action.get("time"),
            rest_override=action.get("rest"),
            note=action.get("note") or "",
            is_active=True,
        )
        return {
            "type": "replace_exercise",
            "deactivated_id": old_te.id,
            "template_exercise_id": new_te.id,
        }

    def _update_weight(self, action: Dict[str, Any]) -> Dict[str, Any]:
        te_id = action.get("template_exercise_id")
        te = TemplateExercise.objects.filter(
            id=te_id, template__folder=self.thread.program, template__folder__user=self.thread.user
        ).first()
        if not te:
            raise LLMInvalidResponse("invalid_update_weight_action")
        changed_fields = []
        for field in ("weight_override", "rep_override", "set_override", "time_override", "rest_override", "note"):
            key = field.replace("_override", "")
            if field == "note":
                value = action.get("note", "")
            else:
                value = action.get(key) if key in action else action.get(field)
            if value is not None:
                setattr(te, field, value)
                changed_fields.append(field)
        if changed_fields:
            te.save(update_fields=changed_fields)
        return {"type": "update_weight", "template_exercise_id": te.id}

    def _build_messages(self, user_message: str, *, mode: str) -> List[Dict[str, Any]]:
        shortlist = self._build_shortlist(user_message)
        system_prompt = (
            "Ты фитнес-ассистент. Обсуждаем корректировку уже существующей программы. "
            "Всегда отвечай на русском. "
            f"Вот доступные упражнения (используй их id): {json.dumps(shortlist, ensure_ascii=False)}"
        )
        if mode == "chat":
            system_prompt += (
                " Отвечай кратко текстом для человека, без Markdown, без кодовых блоков и без JSON. "
                "Просто предложи изменения или ответь на вопросы. Не применяй изменения, не перечисляй всю программу."
            )
        else:
            system_prompt += (
                " Сформируй действия в строгом JSON без Markdown: "
                "{\"assistant_reply\": string, "
                "\"actions\": [{"
                "\"type\": \"add_exercise\"|\"replace_exercise\"|\"update_weight\", "
                "\"day_id\": number?, \"day_name\": string?, "
                "\"deactivate_exercise_id\": number?, "
                "\"template_exercise_id\": number?, "
                "\"exercise_id\": string?, \"exercise_name\": string?, "
                "\"sets\": number|null?, \"reps\": number|null?, \"weight\": number|null?, "
                "\"time\": number|null?, \"rest\": number|null?, \"note\": string?"
                "}]} "
                "assistant_reply — кратко для человека (что предлагаешь, зачем). "
                "Используй exercise_id только из списка available_exercises; если даешь exercise_name, она должна совпадать с каталогом."
            )
        context = {
            "program": self._serialize_program(),
            "latest_actions": self._latest_actions(),
            "available_exercises": shortlist,
        }
        history = []
        for msg in self.thread.messages.order_by("-id")[:12][::-1]:
            history.append({"role": msg.role, "content": msg.content})
        history.append({"role": "user", "content": user_message})
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
            *history,
        ]

    def _latest_actions(self):
        last = self.thread.messages.filter(role=LLMProgramMessage.Role.ASSISTANT).order_by("-id").first()
        return last.actions if last else None

    def _serialize_program(self):
        folder = self.thread.program
        data = {
            "program_id": folder.id,
            "name": folder.name,
            "comment": folder.comment,
            "days": [],
        }
        templates = folder.templates.all().order_by("sort_order", "id").prefetch_related("template_exercises__exercise")
        for day in templates:
            day_entry = {
                "id": day.id,
                "name": day.name,
                "comment": day.comment,
                "is_active": day.is_active,
                "schedule_type": day.schedule_type,
                "schedule_config": day.schedule_config,
                "exercises": [],
            }
            for te in day.template_exercises.order_by("sort_order", "id"):
                if not te.exercise:
                    continue
                day_entry["exercises"].append(
                    {
                        "id": te.id,
                        "exercise_id": te.exercise.id,
                        "name": te.exercise.english_name or te.exercise.name_en or te.exercise.name_ru,
                        "is_active": te.is_active,
                        "sets": te.set_override,
                        "reps": te.rep_override,
                        "weight": float(te.weight_override) if te.weight_override is not None else None,
                        "time": te.time_override,
                        "rest": te.rest_override,
                        "note": te.note,
                    }
                )
            data["days"].append(day_entry)
        return data

    def _call_llm(self, messages: List[Dict[str, Any]]) -> str:
        client = OpenRouterClient()
        return client.create_chat_completion(messages)

    def _parse_response(self, raw_text: str) -> Dict[str, Any]:
        cleaned = raw_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            cleaned = cleaned.replace("json", "", 1).strip()
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise LLMInvalidResponse("invalid_json") from exc
        if "assistant_reply" not in data:
            raise LLMInvalidResponse("assistant_reply_missing")
        if "actions" in data and not isinstance(data["actions"], list):
            raise LLMInvalidResponse("actions_invalid")
        actions = data.get("actions") or []
        data["actions"] = [a for a in actions if isinstance(a, dict)]
        return data

    def _parse_chat_response(self, raw_text: str) -> Dict[str, Any]:
        cleaned = raw_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            cleaned = cleaned.replace("json", "", 1).strip()
        try:
            data = json.loads(cleaned)
            if "assistant_reply" in data:
                return data
        except Exception:
            pass
        return {"assistant_reply": cleaned, "actions": []}

    def _generate_actions(self) -> List[Dict[str, Any]]:
        payload = self._build_messages("Сформируй список действий для подтверждения.", mode="actions")
        raw = self._call_llm(payload)
        parsed = self._parse_response(raw)
        return parsed.get("actions") or []

    def _resolve_day(self, action: Dict[str, Any], fallback_from_te: int | None = None) -> DayTemplate | None:
        day_id = action.get("day_id")
        if day_id:
            day = DayTemplate.objects.filter(
                id=day_id, folder=self.thread.program, folder__user=self.thread.user
            ).first()
            if day:
                return day
        day_name = action.get("day_name")
        if day_name:
            day = DayTemplate.objects.filter(
                folder=self.thread.program, folder__user=self.thread.user, name__iexact=day_name
            ).first()
            if day:
                return day
        if fallback_from_te:
            te = TemplateExercise.objects.filter(
                id=fallback_from_te,
                template__folder=self.thread.program,
                template__folder__user=self.thread.user,
            ).first()
            if te:
                return te.template
        return (
            DayTemplate.objects.filter(folder=self.thread.program, folder__user=self.thread.user, is_active=True)
            .order_by("sort_order", "id")
            .first()
        )

    def _resolve_exercise(self, action: Dict[str, Any]) -> Exercise_DB | None:
        exercise_id = action.get("exercise_id")
        if exercise_id:
            exercise = Exercise_DB.objects.filter(id=exercise_id).first()
            if exercise:
                return exercise
        name = action.get("exercise_name")
        if name:
            return Exercise_DB.objects.filter(
                models.Q(name_ru__iexact=name)
                | models.Q(name_en__iexact=name)
                | models.Q(english_name__iexact=name)
                | models.Q(id__iexact=name)
            ).first()
        return None

    def _build_shortlist(self, query: str | None) -> List[Dict[str, Any]]:
        base_qs = Exercise_DB.objects.exclude(embedding__isnull=True)
        if query:
            # векторный поиск по эмбеддингу, если есть
            try:
                # простой текст → аналогичный корпус: используем postgres vector оператор
                # для удобства — берём embedding первого совпадения по имени, если найдём
                text_match = (
                    Exercise_DB.objects.filter(
                        models.Q(name_ru__icontains=query)
                        | models.Q(name_en__icontains=query)
                        | models.Q(english_name__icontains=query)
                        | models.Q(target_muscles__icontains=query)
                    )
                    .exclude(embedding__isnull=True)
                    .first()
                )
                if text_match and text_match.embedding is not None:
                    qs = (
                        base_qs.annotate(distance=L2Distance("embedding", text_match.embedding))
                        .order_by("distance")[:20]
                    )
                else:
                    qs = base_qs.order_by("id")[:20]
            except Exception:
                qs = base_qs.order_by("id")[:20]
        else:
            qs = base_qs.order_by("id")[:20]
        return [
            {
                "id": ex.id,
                "name": ex.name_ru or ex.english_name or ex.name_en,
                "muscles": ex.target_muscles or "",
                "has_weight": ex.has_weight,
                "has_time": ex.has_time,
            }
            for ex in qs
        ]
