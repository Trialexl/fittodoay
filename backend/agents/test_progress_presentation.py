from copy import deepcopy
import json

from agents.progress_presentation import progress_for_model, humanize_progress_reply


def context():
    return {
        "policy_rollout_mode": "active",
        "policy_decisions": [
            {
                "template_exercise_id": 1,
                "exercise_name": "Жим гантелей лежа",
                "decision": "update_exercise",
                "mode": "NORMAL_PROGRESSION",
                "reason_code": "rep_target_completed",
                "changes": {"reps": {"from": 10, "to": 11}},
                "evidence": {
                    "current_session": {"reps": [11, 11, 11], "weight": [52, 52, 52]}
                },
            },
            {
                "template_exercise_id": 2,
                "exercise_name": "Тяга",
                "decision": "hold",
                "reason_code": "missing_sets_not_assessed",
                "changes": {},
            },
        ],
        "validated_actions": [
            {
                "template_exercise_id": 1,
                "type": "update_exercise",
                "policy_version": "progression-v1",
            }
        ],
        "workout_analysis_snapshot": {"internal": "proof"},
        "weekly_trend": [{"tonnage": 1716}],
    }


def test_progress_context_keeps_facts_and_proposals_but_not_internal_policy_codes():
    original = context()
    before = deepcopy(original)
    shown = progress_for_model(original)
    text = json.dumps(shown, ensure_ascii=False)
    for internal in (
        "policy_rollout_mode",
        "shadow",
        "active",
        "update_exercise",
        "hold",
        "policy_version",
        "NORMAL_PROGRESSION",
        "rep_target_completed",
    ):
        assert internal not in text
    assert shown["weekly_trend"] == [{"tonnage": 1716}]
    assert shown["algorithm_recommendations"][0]["changes"] == {
        "reps": {"from": 10, "to": 11}
    }
    assert shown["exercise_decisions"][1]["reason"].startswith(
        "Упражнение ещё не завершено"
    )
    assert original == before


def test_audit_only_context_never_advertises_an_unavailable_proposal():
    original = context()
    original["policy_rollout_mode"] = "shadow"
    original["validated_actions"] = []
    shown = progress_for_model(original)
    assert shown["algorithm_recommendations"] == []
    assert all(not item["changes"] for item in shown["exercise_decisions"])
    assert "предложений для подтверждения нет" in shown["proposals_note"]


def test_even_a_model_repeating_old_technical_words_gets_readable_labels():
    reply = humanize_progress_reply(
        'policy_rollout_mode: "shadow". Решение update_exercise: 10 → 11, 52 кг. Остальные — hold.'
    )
    assert "10 → 11, 52 кг" in reply
    assert "без изменения плана" in reply
    for internal in ("policy_rollout_mode", "shadow", "update_exercise", "hold"):
        assert internal not in reply
