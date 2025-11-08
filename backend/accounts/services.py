from __future__ import annotations

from dataclasses import dataclass

from .models import UserProfile


@dataclass
class PromptPayload:
    goal: str
    gender: str
    age: int
    weight_kg: float
    height_cm: float
    level: str
    equipment: str
    health_limitations: str


def build_ai_prompt(profile: UserProfile) -> str:
    """Return prompt string for future AI integration (stub for now)."""

    payload = PromptPayload(
        goal=profile.get_goal_display(),
        gender=profile.get_gender_display(),
        age=profile.age,
        weight_kg=float(profile.weight_kg),
        height_cm=float(profile.height_cm),
        level=profile.get_level_display(),
        equipment=profile.equipment,
        health_limitations=profile.health_limitations or "нет ограничений",
    )
    prompt = (
        "Сформируй 2 варианта недельной программы тренировок для цели '{goal}' "
        "для {gender} {age} лет, вес {weight_kg} кг, рост {height_cm} см, уровень {level}. "
        "Доступное оборудование: {equipment}. Ограничения: {health_limitations}. "
        "Ответ должен ссылаться только на упражнения из системного каталога."
    ).format(**payload.__dict__)
    return prompt
