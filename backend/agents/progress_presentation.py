"""Present policy results without exposing rollout switches or internal actions."""

import re


REASONS = {
    "reported_pain": "Отмечен дискомфорт; повышение не предлагается.",
    "missing_sets_not_assessed": "Упражнение ещё не завершено; недостающие подходы не оцениваются.",
    "unsupported_plan": "Для этого формата упражнения автоматическая корректировка не рассчитывается.",
    "unsupported_rep_range": "Цель вне поддерживаемого диапазона повторов; план сохраняется.",
    "missing_measurements": "Не хватает фактических повторов или веса для оценки.",
    "baseline_recorded": "Первая завершённая тренировка упражнения; зафиксирован исходный результат.",
    "return_after_break": "Возвращение после перерыва; параметры плана сохраняются.",
    "non_comparable_weight": "Разные рабочие веса не позволяют подтвердить повышение.",
    "confirmed_top_rep_range": "Верхняя граница повторов достигнута во всех подходах двух сопоставимых тренировок.",
    "rep_target_completed": "Цель по повторам достигнута во всех подходах при плановом весе.",
    "align_plan_with_completed_session": "Все подходы выполнены с одинаковым более высоким весом и достижением цели по повторам.",
    "repeated_below_rep_range": "В двух сопоставимых завершённых тренировках все подходы ниже нижней границы повторов.",
    "await_confirmation": "Недостаточно подтверждений для следующего повышения; параметры плана сохраняются.",
    "maintain_load": "Параметры плана сохраняются.",
    "stale_policy_plan": "План уже изменён после тренировки; новое изменение по старым данным не предлагается.",
    "stale_policy_session": "Есть более поздняя тренировка; предложение по старым данным неактуально.",
}


def progress_for_model(progress):
    """Keep trends, but separate human explanations from the canonical apply proof."""
    private = {
        "policy_rollout_mode",
        "policy_decisions",
        "workout_analysis_snapshot",
        "validated_actions",
        "algorithm_recommendations",
    }
    result = {key: value for key, value in progress.items() if key not in private}
    available = {
        action["template_exercise_id"]
        for action in progress.get("validated_actions", [])
    }
    decisions = []
    for decision in progress.get("policy_decisions", []):
        changes = (
            decision.get("changes", {})
            if decision["template_exercise_id"] in available
            else {}
        )
        evidence = decision.get("evidence", {})
        decisions.append(
            {
                "template_exercise_id": decision["template_exercise_id"],
                "exercise_name": decision["exercise_name"],
                "result": (
                    "Предложить изменение после подтверждения"
                    if changes
                    else "План без изменений"
                ),
                "reason": REASONS.get(
                    decision.get("reason_code"),
                    "Недостаточно актуальных данных для изменения плана.",
                ),
                "changes": changes,
                "current_session": evidence.get("current_session"),
                "previous_similar_workout_date": evidence.get(
                    "previous_similar_workout_date"
                ),
                "days_since_similar_workout": evidence.get(
                    "days_since_similar_workout"
                ),
            }
        )
    result["exercise_decisions"] = decisions
    result["algorithm_recommendations"] = [
        item for item in decisions if item["changes"]
    ]
    result["confirmation_required"] = True
    result["proposals_note"] = (
        "Подготовленные предложения можно сохранить только кнопкой «Применить изменения». План пока не изменён."
        if available
        else "В этом разборе предложений для подтверждения нет. Переписка сама не меняет программу."
    )
    return result


def humanize_progress_reply(reply):
    replacements = {
        **REASONS,
        "policy_rollout_mode": "доступность предложений",
        "policy_decisions": "результаты анализа",
        "validated_actions": "проверенные предложения",
        "update_exercise": "изменение параметров упражнения",
        "INCOMPLETE_SESSION": "упражнение ещё не завершено",
        "RETURN_AFTER_BREAK": "возвращение после перерыва",
        "NORMAL_PROGRESSION": "обычная прогрессия",
        "FIRST_SESSION": "первая тренировка",
        "PAIN_LIMITED": "ограничение из-за дискомфорта",
        "REGRESSION": "повторное снижение результата",
        "hold": "без изменения плана",
        "shadow": "только анализ",
        "active": "предложения с подтверждением",
    }
    pattern = (
        r"(?<!\w)(?:"
        + "|".join(
            re.escape(key) for key in sorted(replacements, key=len, reverse=True)
        )
        + r")(?!\w)"
    )
    by_lower = {key.lower(): value for key, value in replacements.items()}
    return re.sub(
        pattern,
        lambda match: by_lower[match.group().lower()],
        reply,
        flags=re.IGNORECASE,
    )
