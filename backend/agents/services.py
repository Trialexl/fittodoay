from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, List

import httpx
from django.db import transaction

from exercises.models import Exercise
from programs.models import DayTemplate, ProgramFolder, TemplateExercise

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
    def __init__(self, user, *, max_attempts: int = 2):
        self.user = user
        self.max_attempts = max(max_attempts, 1)

    def generate(self, preferences: Dict[str, Any]):
        exercises_snapshot = self._serialize_exercises()
        constraints = self._build_constraints()
        base_messages = self._build_messages(preferences, exercises_snapshot, constraints)

        last_error: Exception | None = None
        for attempt in range(1, self.max_attempts + 1):
            messages = base_messages if attempt == 1 else [*base_messages, self._retry_instruction(attempt)]
            try:
                raw_text = self._call_llm(messages)
                plan = self._parse_plan(raw_text)
                return self._persist_plan(plan)
            except LLMInvalidResponse as exc:
                last_error = exc
                logger.warning(
                    "LLM invalid response attempt %s/%s for user %s: %s",
                    attempt,
                    self.max_attempts,
                    self.user.id,
                    exc,
                )
        if last_error:
            raise last_error
        raise LLMInvalidResponse("invalid_response")

    def _serialize_exercises(self) -> List[Dict[str, Any]]:
        qs = Exercise.objects.all().order_by("id")[:150]
        snapshot = []
        for exercise in qs:
            snapshot.append(
                {
                    "id": exercise.id,
                    "name": exercise.name,
                    "english_name": exercise.english_name,
                    "target_muscles": exercise.target_muscles,
                    "default_sets": exercise.default_sets,
                    "default_reps": exercise.default_reps,
                    "default_weight": float(exercise.default_weight)
                    if exercise.default_weight is not None
                    else None,
                    "default_time": exercise.default_time,
                    "default_rest": exercise.default_rest,
                    "difficulty": exercise.difficulty,
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
            "Ты помощник тренера фитнес-приложения. Составь одну программу тренировок на основе каталога упражнений. "
            "Ответ ОБЯЗАТЕЛЬНО должен быть ПОЛНЫМ JSON-объектом без Markdown-разметки, без ```json, без текста до или после. "
            "JSON должен начинаться с символа '{' и заканчиваться '}'. Никаких комментариев, переносов с ``` и т.п.\n"
            "Строгая схема:\n"
            "{\"programs\": [{\"name\": string, \"comment\": string?, \"days\": ["
            "{\"name\": string, \"comment\": string?, "
            "\"schedule_type\": \"weekly\", \"schedule_config\": {\"days_of_week\": [int]}, "
            "\"exercises\": [{"
            "\"exercise_id\": int, \"sets\": int, \"reps\": int|null, \"weight\": number|null, "
            "\"time\": int|null, \"rest\": int|null, \"note\": string?\n"
            "}]}]}]}\n"
            "Только числа или null (не строки вида \"10 кг\"). Нельзя придумывать новые упражнения; "
            "используй только id из каталога. Если ответ и комментарии не помещаются, сократи количество дней или "
            "упражнений, сделай комментарии короче, но всегда возвращай валидный JSON."
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
        except LLMServiceError:
            raise
        except Exception as exc:  # pragma: no cover - unforeseen errors
            logger.exception("Unexpected LLM error: %s", exc)
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
                    exercise_obj = Exercise.objects.filter(id=exercise_entry.get("exercise_id")).first()
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
