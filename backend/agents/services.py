from __future__ import annotations

import json
import logging
import os
import re
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

    WEEKDAY_ALIASES = {
        "понедельник": (0, "Понедельник"),
        "пн": (0, "Понедельник"),
        "monday": (0, "Понедельник"),
        "вторник": (1, "Вторник"),
        "вт": (1, "Вторник"),
        "tuesday": (1, "Вторник"),
        "среда": (2, "Среда"),
        "ср": (2, "Среда"),
        "wednesday": (2, "Среда"),
        "четверг": (3, "Четверг"),
        "чт": (3, "Четверг"),
        "thursday": (3, "Четверг"),
        "пятница": (4, "Пятница"),
        "пт": (4, "Пятница"),
        "friday": (4, "Пятница"),
        "суббота": (5, "Суббота"),
        "сб": (5, "Суббота"),
        "saturday": (5, "Суббота"),
        "воскресенье": (6, "Воскресенье"),
        "вс": (6, "Воскресенье"),
        "sunday": (6, "Воскресенье"),
    }

    def __init__(self, thread: LLMProgramThread):
        self.thread = thread

    def send(self, user_message: str) -> LLMProgramMessage:
        """Сохраняет сообщение пользователя, дергает LLM (текстовый ответ), сохраняет ответ."""
        LLMProgramMessage.objects.create(
            thread=self.thread,
            role=LLMProgramMessage.Role.USER,
            content=user_message,
            proposal_status=LLMProgramMessage.ProposalStatus.NONE,
        )
        payload = self._build_messages(user_message, mode="chat")
        raw = None
        parsed = None
        try:
            raw = self._call_llm(payload)
            parsed = self._parse_chat_response(raw)
        except LLMUnavailableError as exc:
            self._log_request(
                payload=payload,
                response={"raw": raw} if raw is not None else None,
                success=False,
                status="chat_unavailable",
                error=str(exc),
            )
            raise
        except LLMInvalidResponse as exc:
            self._log_request(
                payload=payload,
                response={"raw": raw} if raw is not None else None,
                success=False,
                status="chat_invalid_response",
                error=str(exc),
            )
            raise
        except LLMServiceError as exc:
            self._log_request(
                payload=payload,
                response={"raw": raw} if raw is not None else None,
                success=False,
                status="chat_error",
                error=str(exc),
            )
            raise
        actions = parsed.get("actions") if isinstance(parsed.get("actions"), list) else []
        proposal_status = (
            LLMProgramMessage.ProposalStatus.PENDING
            if actions
            else LLMProgramMessage.ProposalStatus.NONE
        )
        assistant_msg = LLMProgramMessage.objects.create(
            thread=self.thread,
            role=LLMProgramMessage.Role.ASSISTANT,
            content=parsed.get("assistant_reply", ""),
            actions=actions,
            proposal_status=proposal_status,
        )
        self.thread.updated_at = timezone.now()
        self.thread.save(update_fields=["updated_at"])
        self._log_request(
            payload=payload,
            response={"raw": raw, "parsed": parsed},
            success=True,
            status="chat_ok",
        )
        return assistant_msg

    def apply_actions(self, message_id: int):
        """Применяет подтверждённый пользователем набор действий из конкретного сообщения."""
        message = self._get_actionable_message(message_id)
        actions = message.actions or []
        if not actions:
            raise LLMInvalidResponse("no_actions_to_apply")
        with transaction.atomic():
            results = []
            for action in actions:
                try:
                    result = self._apply_action(action)
                except LLMInvalidResponse as exc:
                    result = {
                        "status": "skipped",
                        "reason": str(exc),
                        "action": action,
                    }
                results.append(result)
            message.proposal_status = LLMProgramMessage.ProposalStatus.APPLIED
            message.save(update_fields=["proposal_status"])
        return results

    def cancel_actions(self, message_id: int):
        message = self._get_actionable_message(message_id)
        message.proposal_status = LLMProgramMessage.ProposalStatus.CANCELLED
        message.save(update_fields=["proposal_status"])
        return {"message_id": message.id, "status": message.proposal_status}

    def _get_actionable_message(self, message_id: int) -> LLMProgramMessage:
        message = self.thread.messages.filter(
            id=message_id,
            role=LLMProgramMessage.Role.ASSISTANT,
        ).first()
        if not message:
            raise LLMInvalidResponse("message_not_found")
        if not isinstance(message.actions, list) or not message.actions:
            raise LLMInvalidResponse("message_has_no_actions")
        if message.proposal_status != LLMProgramMessage.ProposalStatus.PENDING:
            raise LLMInvalidResponse(f"proposal_not_pending_{message.proposal_status}")
        return message

    def _apply_action(self, action: Dict[str, Any]) -> Dict[str, Any]:
        raw_action_type = action.get("type") or action.get("action_type") or action.get("action")
        action_type = str(raw_action_type).strip().lower() if raw_action_type is not None else None
        alias_map = {
            "add_exercise_to_day": "add_exercise",
            "add_exercise": "add_exercise",
            "replace_exercise_in_day": "replace_exercise",
            "replace_exercise": "replace_exercise",
            "remove_exercise_from_day": "remove_exercise",
            "remove_exercise": "remove_exercise",
            "delete_exercise": "remove_exercise",
            "update_exercise": "update_weight",
            "update_exercise_params": "update_weight",
            "update_weight": "update_weight",
        }
        action_type = alias_map.get(action_type, action_type)
        if action_type == "add_exercise":
            return self._add_exercise(action)
        if action_type == "replace_exercise":
            return self._replace_exercise(action)
        if action_type == "remove_exercise":
            return self._remove_exercise(action)
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
        defaults = self._build_exercise_defaults(exercise, action)
        sort_order = (day.template_exercises.aggregate(models.Max("sort_order")).get("sort_order__max") or 0) + 1
        new_te = TemplateExercise.objects.create(
            template=day,
            exercise=exercise,
            custom_exercise=None,
            sort_order=sort_order,
            set_override=defaults["sets"],
            rep_override=defaults["reps"],
            weight_override=defaults["weight"],
            time_override=defaults["time"],
            rest_override=defaults["rest"],
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
        defaults = self._build_exercise_defaults(exercise, action)
        sort_order = (day.template_exercises.aggregate(models.Max("sort_order")).get("sort_order__max") or 0) + 1
        new_te = TemplateExercise.objects.create(
            template=day,
            exercise=exercise,
            sort_order=sort_order,
            set_override=defaults["sets"],
            rep_override=defaults["reps"],
            weight_override=defaults["weight"],
            time_override=defaults["time"],
            rest_override=defaults["rest"],
            note=action.get("note") or "",
            is_active=True,
        )
        return {
            "type": "replace_exercise",
            "deactivated_id": old_te.id,
            "template_exercise_id": new_te.id,
        }

    def _remove_exercise(self, action: Dict[str, Any]) -> Dict[str, Any]:
        day = self._resolve_day(action)
        exercise = self._resolve_exercise(action)
        te_id = action.get("template_exercise_id") or action.get("deactivate_exercise_id")

        qs = TemplateExercise.objects.filter(
            template__folder=self.thread.program,
            template__folder__user=self.thread.user,
            is_active=True,
        )
        if day:
            qs = qs.filter(template=day)
        if exercise:
            qs = qs.filter(exercise=exercise)
        if te_id:
            qs = qs.filter(id=te_id)

        target = qs.order_by("sort_order", "id").first()
        if not target:
            raise LLMInvalidResponse(
                "remove_exercise requires valid template_exercise_id or resolvable day/exercise"
            )

        target.is_active = False
        target.save(update_fields=["is_active"])
        return {"type": "remove_exercise", "template_exercise_id": target.id}

    def _update_weight(self, action: Dict[str, Any]) -> Dict[str, Any]:
        te_id = action.get("template_exercise_id")
        te = None
        if te_id:
            te = TemplateExercise.objects.filter(
                id=te_id, template__folder=self.thread.program, template__folder__user=self.thread.user
            ).first()
        if not te:
            day = self._resolve_day(action)
            exercise = self._resolve_exercise(action)
            qs = TemplateExercise.objects.filter(
                template__folder=self.thread.program,
                template__folder__user=self.thread.user,
                is_active=True,
            )
            if day:
                qs = qs.filter(template=day)
            if exercise:
                qs = qs.filter(exercise=exercise)
            te = qs.order_by("sort_order", "id").first()
        if not te:
            raise LLMInvalidResponse("invalid_update_weight_action")
        changed_fields = []
        for field in ("weight_override", "rep_override", "set_override", "time_override", "rest_override", "note"):
            key = field.replace("_override", "")
            if field == "note":
                value = action.get("note", "")
            else:
                aliases = {
                    "rep": ("reps", "rep"),
                    "set": ("sets", "set"),
                }
                alias_keys = aliases.get(key, (key,))
                value = None
                for alias_key in alias_keys:
                    if alias_key in action:
                        value = action.get(alias_key)
                        break
                if value is None:
                    value = action.get(field)
            if value is not None:
                setattr(te, field, value)
                changed_fields.append(field)
        if changed_fields:
            te.save(update_fields=changed_fields)
        return {"type": "update_weight", "template_exercise_id": te.id}

    def _build_exercise_defaults(self, exercise: Exercise_DB, action: Dict[str, Any]) -> Dict[str, Any]:
        sets = action.get("sets")
        reps = action.get("reps")
        weight = action.get("weight")
        time = action.get("time")
        rest = action.get("rest")
        return {
            "sets": sets if sets is not None else exercise.default_sets,
            "reps": reps if reps is not None else (exercise.default_reps if not exercise.has_time else None),
            "weight": weight if weight is not None else (exercise.default_weight if exercise.has_weight else None),
            "time": time if time is not None else (exercise.default_time if exercise.has_time else None),
            "rest": rest if rest is not None else exercise.default_rest,
        }

    def _build_messages(self, user_message: str, *, mode: str) -> List[Dict[str, Any]]:
        shortlist = self._build_shortlist(user_message)
        system_prompt = (
            "Ты фитнес-ассистент. Обсуждаем корректировку уже существующей программы. "
            "Всегда отвечай на русском. "
            f"Вот доступные упражнения (используй их id): {json.dumps(shortlist, ensure_ascii=False)}"
        )
        if mode == "chat":
            system_prompt += (
                " Верни JSON без Markdown с полями: "
                "{\"assistant_reply\": string, \"actions\": Array<object>}. "
                "assistant_reply — это понятный человеку ответ простым языком. "
                "actions — только конкретные изменения для подтверждения пользователем; если изменений нет, верни пустой массив. "
                "Если пользователь указывает день недели (например, 'среда'), используй это как day_name. "
                "Если такого дня в программе нет, все равно формируй действия с этим day_name — система создаст день автоматически. "
                "Если пользователь просит помочь с выбором упражнения, обязательно предложи 2-4 варианта и коротко объясни, чем они отличаются и кому подходят. "
                "Если пользователь просит 'как делать', дай краткую технику выполнения: исходное положение, движение, дыхание, типичные ошибки и безопасный диапазон нагрузки. "
                "Не отказывай в таком объяснении по общим причинам, если запрос относится к обычным упражнениям из фитнес-каталога. "
                "Не применяй изменения самостоятельно, не отвечай служебным текстом."
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
            if isinstance(data, dict):
                actions = data.get("actions") if isinstance(data.get("actions"), list) else []
                reply = (
                    data.get("assistant_reply")
                    or data.get("reply")
                    or data.get("message")
                    or data.get("text")
                )
                if isinstance(reply, str) and reply.strip():
                    return {"assistant_reply": reply.strip(), "actions": actions}
                if actions:
                    return {
                        "assistant_reply": "Подготовил предложения по изменениям. Проверьте их ниже и примените при необходимости.",
                        "actions": actions,
                    }
        except Exception:
            pass
        extracted_reply = self._extract_reply_from_malformed_json(cleaned)
        if extracted_reply:
            return {"assistant_reply": extracted_reply, "actions": []}
        return {"assistant_reply": cleaned, "actions": []}

    def _extract_reply_from_malformed_json(self, text: str) -> str | None:
        # Handle partial JSON like {"assistant_reply":"... without closing braces/quotes.
        match = re.search(r'"assistant_reply"\s*:\s*"(.*)', text, flags=re.DOTALL)
        if not match:
            return None
        raw_tail = match.group(1)
        # Prefer content until the next unescaped quote if present.
        end_match = re.search(r'(?<!\\)"', raw_tail)
        value = raw_tail[: end_match.start()] if end_match else raw_tail
        value = value.replace('\\"', '"').replace("\\n", "\n").replace("\\t", "\t").strip()
        return value or None

    def _log_request(self, *, payload, response, success: bool, status: str, error: str | None = None):
        try:
            LLMRequestLog.objects.create(
                user=self.thread.user,
                payload=payload,
                response=response,
                status=status,
                success=success,
                error_message=error or "",
                created_at=timezone.now(),
            )
        except Exception:  # pragma: no cover
            logger.exception("Failed to log LLM chat request")

    def _generate_actions(self) -> List[Dict[str, Any]]:
        payload = self._build_messages("Сформируй список действий для подтверждения.", mode="actions")
        raw = self._call_llm(payload)
        parsed = self._parse_response(raw)
        return parsed.get("actions") or []

    def _resolve_day(self, action: Dict[str, Any], fallback_from_te: int | None = None) -> DayTemplate | None:
        day_id = action.get("day_id")
        day_name = action.get("day_name") or action.get("day")
        explicit_day_provided = bool(day_id or day_name)
        if day_id:
            day = DayTemplate.objects.filter(
                id=day_id, folder=self.thread.program, folder__user=self.thread.user
            ).first()
            if day:
                return day
        if day_name:
            day = DayTemplate.objects.filter(
                folder=self.thread.program, folder__user=self.thread.user, name__iexact=day_name
            ).first()
            if day:
                return day
            weekday = self._extract_weekday(day_name)
            if weekday is not None:
                weekday_index, weekday_label = weekday
                by_weekday = self._find_day_by_weekday(weekday_index)
                if by_weekday:
                    return by_weekday
                return self._create_weekday_day(weekday_index, weekday_label)
        if fallback_from_te:
            te = TemplateExercise.objects.filter(
                id=fallback_from_te,
                template__folder=self.thread.program,
                template__folder__user=self.thread.user,
            ).first()
            if te:
                return te.template
        if explicit_day_provided:
            return None
        active_day = (
            DayTemplate.objects.filter(folder=self.thread.program, folder__user=self.thread.user, is_active=True)
            .order_by("sort_order", "id")
            .first()
        )
        if active_day:
            return active_day
        return (
            DayTemplate.objects.filter(folder=self.thread.program, folder__user=self.thread.user)
            .order_by("sort_order", "id")
            .first()
        )

    def _resolve_exercise(self, action: Dict[str, Any]) -> Exercise_DB | None:
        exercise_id = action.get("exercise_id")
        if exercise_id:
            exercise = Exercise_DB.objects.filter(id=exercise_id).first()
            if exercise:
                return exercise
            candidate_name = str(exercise_id).replace("_", " ").strip()
            by_name = Exercise_DB.objects.filter(
                models.Q(name_ru__iexact=candidate_name)
                | models.Q(name_en__iexact=candidate_name)
                | models.Q(id__iexact=candidate_name)
            ).first()
            if by_name:
                return by_name
        name = action.get("exercise_name") or action.get("name")
        if name:
            exact = Exercise_DB.objects.filter(
                models.Q(name_ru__iexact=name)
                | models.Q(name_en__iexact=name)
                | models.Q(id__iexact=name)
            ).first()
            if exact:
                return exact
            relaxed = Exercise_DB.objects.filter(
                models.Q(name_ru__icontains=name)
                | models.Q(name_en__icontains=name)
                | models.Q(id__icontains=name.replace(" ", "_"))
            ).first()
            if relaxed:
                return relaxed
        if exercise_id:
            relaxed_from_id = Exercise_DB.objects.filter(
                models.Q(name_ru__icontains=str(exercise_id).replace("_", " "))
                | models.Q(name_en__icontains=str(exercise_id).replace("_", " "))
                | models.Q(id__icontains=str(exercise_id))
            ).first()
            if relaxed_from_id:
                return relaxed_from_id
        return None

    def _extract_weekday(self, text: str) -> tuple[int, str] | None:
        normalized = re.sub(r"[^a-zA-Zа-яА-ЯёЁ0-9]+", " ", text).strip().lower()
        if not normalized:
            return None
        if normalized in self.WEEKDAY_ALIASES:
            return self.WEEKDAY_ALIASES[normalized]
        for token in normalized.split():
            if token in self.WEEKDAY_ALIASES:
                return self.WEEKDAY_ALIASES[token]
        return None

    def _find_day_by_weekday(self, weekday_index: int) -> DayTemplate | None:
        templates = DayTemplate.objects.filter(
            folder=self.thread.program,
            folder__user=self.thread.user,
        ).order_by("sort_order", "id")
        for template in templates:
            if template.schedule_type != DayTemplate.ScheduleType.WEEKLY:
                continue
            days = (template.schedule_config or {}).get("days_of_week") or []
            normalized_days = {int(day) for day in days if str(day).isdigit()}
            if weekday_index in normalized_days:
                return template
        return None

    def _create_weekday_day(self, weekday_index: int, weekday_label: str) -> DayTemplate:
        base_name = f"День ({weekday_label})"
        name = base_name
        suffix = 2
        while DayTemplate.objects.filter(folder=self.thread.program, name=name).exists():
            name = f"{base_name} {suffix}"
            suffix += 1
        last_sort_order = (
            DayTemplate.objects.filter(folder=self.thread.program)
            .order_by("-sort_order", "-id")
            .values_list("sort_order", flat=True)
            .first()
            or 0
        )
        return DayTemplate.objects.create(
            folder=self.thread.program,
            name=name,
            schedule_type=DayTemplate.ScheduleType.WEEKLY,
            schedule_config={"days_of_week": [weekday_index]},
            sort_order=last_sort_order + 1,
            is_active=True,
        )

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
