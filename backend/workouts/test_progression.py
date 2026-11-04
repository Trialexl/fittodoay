from copy import deepcopy
from dataclasses import replace
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import override_settings

from agents.models import LLMProgramMessage, LLMProgramThread
from agents.services import LLMInvalidResponse, LLMProgramChatService
from programs.models import DayTemplate, ProgramFolder, TemplateExercise
from workouts.models import Exercise_DB, WorkoutAnalysisRun, WorkoutDay, WorkoutSetLog
from workouts.progression import (
    analyze_workout,
    build_workout_snapshot,
    decide,
    validate_policy_action,
)
from workouts.recommendations import generate_recommendations_for_day

pytestmark = pytest.mark.django_db
TODAY = date(2026, 11, 4)


@pytest.fixture
def program():
    user = get_user_model().objects.create_user(
        email="policy@example.com", password="pass"
    )
    folder = ProgramFolder.objects.create(user=user, name="Policy")
    template = DayTemplate.objects.create(
        folder=folder, name="День 2", schedule_type="weekly"
    )
    return user, folder, template


def exercise(program, name="Тяга одной рукой", reps=8, weight=34, has_weight=True):
    _, _, template = program
    source = Exercise_DB.objects.create(
        id=f"policy_{TemplateExercise.objects.count()}",
        name_ru=name,
        name_en=name,
        has_weight=has_weight,
        default_weight=weight if has_weight else None,
        default_sets=3,
        default_reps=reps,
    )
    return TemplateExercise.objects.create(
        template=template,
        exercise=source,
        rep_override=reps,
        set_override=3,
        weight_override=weight if has_weight else None,
    )


def session(program, day_date, exercises, results):
    user, folder, template = program
    entries = []
    for te in exercises:
        defaults = {
            "reps": te.rep_override,
            "weight": (
                float(te.weight_override) if te.weight_override is not None else None
            ),
            "sets": 3,
            "has_weight": te.exercise.has_weight,
            "has_time": False,
        }
        entries.append(
            {
                "template_exercise_id": te.pk,
                "source": {
                    "type": "system",
                    "id": te.exercise_id,
                    "name": te.exercise.name,
                },
                "defaults": defaults,
                "sets": [
                    {
                        "set_index": i,
                        "default_reps": defaults["reps"],
                        "default_weight": defaults["weight"],
                    }
                    for i in (1, 2, 3)
                ],
            }
        )
    day = WorkoutDay.objects.create(
        user=user,
        date=day_date,
        source_folder_ids=[folder.pk],
        source_template_ids=[template.pk],
        plan_snapshot={
            "folders": [
                {
                    "id": folder.pk,
                    "name": folder.name,
                    "templates": [
                        {"id": template.pk, "name": template.name, "exercises": entries}
                    ],
                }
            ]
        },
    )
    for te in exercises:
        for idx, (weight, reps) in enumerate(results.get(te.pk, []), 1):
            WorkoutSetLog.objects.create(
                workout_day=day,
                template_exercise=te,
                set_index=idx,
                actual_weight=weight,
                actual_reps=reps,
            )
    return day


def report_for(program, day):
    return analyze_workout(day, program[1].pk)


def test_case_27_of_30_return_and_exact_alignment(program):
    exercises = [exercise(program, name="Подтягивания", reps=11, has_weight=False)]
    exercises += [exercise(program, name=f"Тяга {i}") for i in range(8)]
    exercises += [exercise(program, name="Супермен", has_weight=False)]
    previous_results = {
        te.pk: [(32 if te.exercise.has_weight else None, 12)] * 3 for te in exercises
    }
    session(program, TODAY - timedelta(days=21), exercises, previous_results)
    session(
        program, TODAY - timedelta(days=14), exercises, {}
    )  # Empty plan must not hide break.
    results = {
        te.pk: [(34 if te.exercise.has_weight else None, 8)] * 3
        for te in exercises[:-1]
    }
    results[exercises[1].pk] = [(36, 8)] * 3
    day = session(program, TODAY, exercises, results)
    report = report_for(program, day)
    assert day.set_logs.count() == 27
    assert len(report["decisions"]) == 10
    assert report["decisions"][0]["decision"] == "hold"
    assert report["decisions"][0]["mode"] == "RETURN_AFTER_BREAK"
    assert report["decisions"][-1]["mode"] == "INCOMPLETE_SESSION"
    assert len(report["actions"]) == 1
    action = report["actions"][0]
    assert action["template_exercise_id"] == exercises[1].pk
    assert action["changes"] == {"weight": {"from": 34, "to": 36}}
    assert action["evidence"]["days_since_similar_workout"] == 21
    assert action["evidence"]["current_session"]["reps"] == [8, 8, 8]
    assert validate_policy_action(program[0], action).pk == exercises[1].pk
    # Also fix the legacy all-or-nothing folder gate during the shadow comparison.
    assert any(
        rec["template_exercise_id"] == exercises[1].pk
        for folder in generate_recommendations_for_day(day)
        for rec in folder["recommendations"]
    )


@pytest.mark.parametrize("reps,weight", [(6, 34), (12, 34), (8, 30)])
def test_return_session_never_progresses_or_reduces(program, reps, weight):
    te = exercise(program)
    session(program, TODAY - timedelta(days=21), [te], {te.pk: [(34, 8)] * 3})
    day = session(program, TODAY, [te], {te.pk: [(weight, reps)] * 3})
    assert report_for(program, day)["actions"] == []
    assert (
        report_for(program, day)["decisions"][0]["reason_code"] == "return_after_break"
    )


def test_current_results_override_historical_average_and_no_rounding(program):
    te = exercise(program)
    for weeks in range(3, 0, -1):
        session(
            program, TODAY - timedelta(days=weeks * 7), [te], {te.pk: [(32, 12)] * 3}
        )
    day = session(program, TODAY, [te], {te.pk: [(35, 8)] * 3})
    action = report_for(program, day)["actions"][0]
    assert action["changes"] == {"weight": {"from": 34, "to": 35}}
    assert action["evidence"]["current_session"]["weight"] == [35, 35, 35]


@pytest.mark.parametrize(
    "previous,current,expect",
    [
        ([12, 12, 12], [12, 12, 12], True),
        ([11, 12, 13], [12, 12, 12], False),
        ([12, 12], [12, 12, 12], False),
        ([12, 12, 12], [11, 12, 13], False),
    ],
)
def test_weight_progression_requires_all_sets_twice(program, previous, current, expect):
    te = exercise(program, reps=12)
    session(
        program, TODAY - timedelta(days=7), [te], {te.pk: [(34, r) for r in previous]}
    )
    day = session(program, TODAY, [te], {te.pk: [(34, r) for r in current]})
    actions = report_for(program, day)["actions"]
    assert bool(actions) is expect
    if expect:
        assert actions[0]["changes"] == {
            "weight": {"from": 34, "to": 36},
            "reps": {"from": 12, "to": 8},
        }


@pytest.mark.parametrize(
    "previous,current,reason",
    [(10, 6, "await_confirmation"), (6, 6, "repeated_below_rep_range")],
)
def test_regression_requires_two_low_sessions(program, previous, current, reason):
    te = exercise(program, reps=10)
    session(program, TODAY - timedelta(days=7), [te], {te.pk: [(34, previous)] * 3})
    day = session(program, TODAY, [te], {te.pk: [(34, current)] * 3})
    report = report_for(program, day)
    assert report["decisions"][0]["reason_code"] == reason
    assert bool(report["actions"]) is (previous == 6)


def test_first_session_and_missing_effort_are_not_invented(program):
    te = exercise(program)
    day = session(program, TODAY, [te], {te.pk: [(36, 12)] * 3})
    report = report_for(program, day)
    assert report["actions"] == []
    assert report["decisions"][0]["mode"] == "FIRST_SESSION"
    snapshot = report["snapshot"]["exercises"][0]
    assert snapshot["rir"] is snapshot["rpe"] is snapshot["pain"] is None
    assert all(
        rec["estimated_rir"] is None and "RIR≈" not in rec["reason"]
        for folder in generate_recommendations_for_day(day)
        for rec in folder["recommendations"]
    )
    # Ready for explicit measurements, but production never populates unavailable fields.
    measured = replace(build_workout_snapshot(day, program[1].pk).exercises[0], pain=3)
    assert decide(measured)["mode"] == "PAIN_LIMITED"


@pytest.mark.parametrize(
    "field,value",
    [
        ("template_exercise_id", None),
        ("exercise_name", "Лэндмайн"),
        ("day_id", 99999),
        ("program_id", 99999),
    ],
)
def test_strict_validator_rejects_wrong_identity(program, field, value):
    te = exercise(program)
    session(program, TODAY - timedelta(days=7), [te], {te.pk: [(34, 8)] * 3})
    day = session(program, TODAY, [te], {te.pk: [(36, 8)] * 3})
    action = deepcopy(report_for(program, day)["actions"][0])
    action[field] = value
    with pytest.raises(ValueError):
        validate_policy_action(program[0], action)


def test_validator_rejects_forged_values_changed_logs_and_stale_plan(program):
    te = exercise(program)
    session(program, TODAY - timedelta(days=7), [te], {te.pk: [(34, 8)] * 3})
    day = session(program, TODAY, [te], {te.pk: [(36, 8)] * 3})
    action = report_for(program, day)["actions"][0]
    forged = deepcopy(action)
    forged["changes"]["weight"]["to"] = 100
    with pytest.raises(ValueError, match="evidence"):
        validate_policy_action(program[0], forged)
    te.weight_override = 35
    te.save()
    with pytest.raises(ValueError, match="stale_policy_plan"):
        validate_policy_action(program[0], action)
    te.weight_override = 34
    te.save()
    day.set_logs.update(actual_reps=5)
    with pytest.raises(ValueError, match="evidence"):
        validate_policy_action(program[0], action)


def test_catalog_id_collision_cannot_rename_or_apply_update(program):
    te = exercise(program)
    Exercise_DB.objects.create(
        id=str(te.pk), name_ru="Вращения с лэндмайном 180°", name_en="Landmine"
    )
    thread = LLMProgramThread.objects.create(user=program[0], program=program[1])
    service = LLMProgramChatService(thread)
    action = {
        "type": "update_exercise",
        "exercise_id": te.pk,
        "exercise_name": te.exercise.name,
        "weight": 36,
    }
    assert service._normalize_actions_for_display([action]) == []
    with pytest.raises(LLMInvalidResponse):
        service._apply_action(action)
    te.refresh_from_db()
    assert te.weight_override == Decimal("34")
    wrong_name = {
        "type": "update_exercise",
        "template_exercise_id": te.pk,
        "exercise_name": "Лэндмайн",
        "weight": 36,
    }
    assert service._normalize_actions_for_display([wrong_name]) == []


@pytest.mark.parametrize("mode", ["shadow", "active"])
def test_llm_cannot_change_policy_actions_and_ui_apply_uses_db_proof(
    program, monkeypatch, mode
):
    te = exercise(program)
    session(program, TODAY - timedelta(days=21), [te], {te.pk: [(32, 12)] * 3})
    day = session(program, TODAY, [te], {te.pk: [(36, 8)] * 3})
    thread = LLMProgramThread.objects.create(user=program[0], program=program[1])
    service = LLMProgramChatService(thread)
    monkeypatch.setattr(
        service,
        "_call_llm",
        lambda _: '{"assistant_reply":"Разбор","actions":[{"type":"update_exercise","template_exercise_id":99999,"weight":100,"reps":7}]}',
    )
    with override_settings(WORKOUT_PROGRESSION_MODE=mode):
        message = service.send(
            "Разбери тренировку", chat_mode="post_workout_review", workout_date=TODAY
        )
        message.refresh_from_db()
        audit = WorkoutAnalysisRun.objects.get(workout_day=day)
        assert audit.mode == mode
        assert audit.report["actions"][0]["changes"] == {
            "weight": {"from": 34, "to": 36}
        }
        if mode == "shadow":
            assert message.actions == []
            assert message.proposal_status == LLMProgramMessage.ProposalStatus.NONE
        else:
            assert len(message.actions) == 1
            action = message.actions[0]
            assert action["template_exercise_id"] == te.pk
            assert action["weight"] == 36
            assert "reps" not in action
            results = service.apply_actions(message.pk)
            assert results[0]["template_exercise_id"] == te.pk
            te.refresh_from_db()
            assert te.weight_override == Decimal("36")
            assert te.rep_override == 8


def test_empty_plans_and_future_workouts_do_not_distort_selected_context(program):
    te = exercise(program)
    session(program, TODAY - timedelta(days=21), [te], {te.pk: [(32, 12)] * 3})
    session(program, TODAY - timedelta(days=14), [te], {})
    session(program, TODAY, [te], {te.pk: [(36, 8)] * 3})
    session(program, TODAY + timedelta(days=7), [te], {te.pk: [(50, 20)] * 3})
    thread = LLMProgramThread.objects.create(user=program[0], program=program[1])
    context = LLMProgramChatService(thread)._build_post_workout_context(
        workout_date=TODAY
    )
    assert context["latest_workout_summary"]["date"] == TODAY.isoformat()
    assert len(context["recent_workouts"]) == 2
    assert sum(week["workout_days"] for week in context["weekly_trend"]) == 2
    assert context["day_type_trend"][0]["sessions"] == 2
    assert (
        context["policy_decisions"][0]["evidence"]["days_since_similar_workout"] == 21
    )
    empty = LLMProgramChatService(thread)._build_post_workout_context(
        workout_date=TODAY - timedelta(days=14)
    )
    assert empty["latest_workout_summary"] is None
    assert empty["validated_actions"] == []


def test_replay_is_read_only_and_reports_twenty_sessions(program):
    from io import StringIO

    te = exercise(program)
    for index in range(20):
        session(
            program, TODAY - timedelta(days=index * 7), [te], {te.pk: [(34, 8)] * 3}
        )
    output = StringIO()
    call_command(
        "replay_workout_policy", program_id=program[1].pk, limit=20, stdout=output
    )
    assert '"sessions": 20' in output.getvalue()
    assert '"programs_changed": 0' in output.getvalue()
    assert not WorkoutAnalysisRun.objects.exists()
    te.refresh_from_db()
    assert te.weight_override == Decimal("34")
    assert te.rep_override == 8


def test_other_users_logs_and_actions_are_rejected(program):
    te = exercise(program)
    session(program, TODAY - timedelta(days=7), [te], {te.pk: [(34, 8)] * 3})
    day = session(program, TODAY, [te], {te.pk: [(36, 8)] * 3})
    other = get_user_model().objects.create_user(
        email="other_policy@example.com", password="pass"
    )
    action = report_for(program, day)["actions"][0]
    with pytest.raises(ValueError, match="invalid_policy_target"):
        validate_policy_action(other, action)


def test_rep_progression_uses_worst_set_not_average(program):
    te = exercise(program, reps=10)
    session(program, TODAY - timedelta(days=7), [te], {te.pk: [(34, 10)] * 3})
    day = session(program, TODAY, [te], {te.pk: [(34, 10), (34, 10), (34, 9)]})
    assert report_for(program, day)["actions"] == []
    day.set_logs.update(actual_reps=10)
    assert report_for(program, day)["actions"][0]["changes"] == {
        "reps": {"from": 10, "to": 11}
    }


def test_regression_does_not_count_return_workout_as_failure(program):
    te = exercise(program)
    session(program, TODAY - timedelta(days=28), [te], {te.pk: [(34, 8)] * 3})
    session(program, TODAY - timedelta(days=7), [te], {te.pk: [(34, 6)] * 3})
    day = session(program, TODAY, [te], {te.pk: [(34, 6)] * 3})
    assert report_for(program, day)["actions"] == []


def test_zero_weight_override_is_preserved(program):
    from workouts.services import resolve_defaults

    te = exercise(program)
    te.weight_override = Decimal("0")
    te.save()
    assert resolve_defaults(te)["weight"] == 0


def test_http_review_and_apply_preserve_canonical_policy(program, monkeypatch):
    from rest_framework.test import APIClient

    te = exercise(program)
    session(program, TODAY - timedelta(days=21), [te], {te.pk: [(32, 12)] * 3})
    session(program, TODAY, [te], {te.pk: [(36, 8)] * 3})
    client = APIClient()
    client.force_authenticate(user=program[0])
    thread = client.post(
        "/api/llm-agent/threads/", {"program_id": program[1].pk}, format="json"
    )
    assert thread.status_code == 201
    thread_id = thread.data["id"]
    monkeypatch.setattr(
        LLMProgramChatService,
        "_call_llm",
        lambda *_: '{"assistant_reply":"После перерыва сохраняем повторы.","actions":[]}',
    )
    with override_settings(WORKOUT_PROGRESSION_MODE="active"):
        response = client.post(
            f"/api/llm-agent/threads/{thread_id}/messages/",
            {
                "message": "Разбери",
                "mode": "post_workout_review",
                "workout_date": TODAY.isoformat(),
            },
            format="json",
        )
        assert response.status_code == 201
        message = LLMProgramMessage.objects.filter(
            thread_id=thread_id, role="assistant"
        ).get()
        assert response.data["assistant"]["actions"][0]["weight"] == 36
        applied = client.post(
            f"/api/llm-agent/threads/{thread_id}/apply/",
            {"message_id": message.pk},
            format="json",
        )
        assert applied.status_code == 200
        assert applied.data["applied"][0]["template_exercise_id"] == te.pk
        repeated = client.post(
            f"/api/llm-agent/threads/{thread_id}/apply/",
            {"message_id": message.pk},
            format="json",
        )
        assert repeated.status_code == 400
    te.refresh_from_db()
    assert te.weight_override == Decimal("36") and te.rep_override == 8


def test_no_card_or_explanation_change_if_plan_was_edited(program):
    te = exercise(program)
    session(program, TODAY - timedelta(days=7), [te], {te.pk: [(34, 8)] * 3})
    session(program, TODAY, [te], {te.pk: [(36, 8)] * 3})
    te.rep_override = 10
    te.save()
    thread = LLMProgramThread.objects.create(user=program[0], program=program[1])
    with override_settings(WORKOUT_PROGRESSION_MODE="active"):
        context = LLMProgramChatService(thread)._build_post_workout_context(
            workout_date=TODAY
        )
    assert context["validated_actions"] == []
    assert context["policy_decisions"][0]["decision"] == "hold"
    assert context["policy_decisions"][0]["reason_code"] == "stale_policy_plan"
    assert context["policy_decisions"][0]["changes"] == {}


def test_replaced_exercise_does_not_reuse_old_history(program):
    te = exercise(program)
    session(program, TODAY - timedelta(days=14), [te], {te.pk: [(34, 12)] * 3})
    previous = session(
        program, TODAY - timedelta(days=7), [te], {te.pk: [(34, 12)] * 3}
    )
    snapshot = deepcopy(previous.plan_snapshot)
    snapshot["folders"][0]["templates"][0]["exercises"][0]["source"][
        "id"
    ] = "other_exercise"
    previous.plan_snapshot = snapshot
    previous.save()
    day = session(program, TODAY, [te], {te.pk: [(34, 12)] * 3})
    assert report_for(program, day)["actions"] == []
    assert report_for(program, day)["decisions"][0]["mode"] == "FIRST_SESSION"


@pytest.mark.parametrize("target", [5, 15, 20])
def test_custom_rep_ranges_are_not_forced_into_default_range(program, target):
    te = exercise(program, reps=target)
    session(program, TODAY - timedelta(days=7), [te], {te.pk: [(34, target)] * 3})
    day = session(program, TODAY, [te], {te.pk: [(34, target)] * 3})
    report = report_for(program, day)
    assert report["actions"] == []
    assert report["decisions"][0]["reason_code"] == "unsupported_rep_range"
