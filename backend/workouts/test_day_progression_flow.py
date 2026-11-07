"""Day logging -> policy cards -> confirmation -> next workout targets."""

from copy import deepcopy
from datetime import date, timedelta

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from agents.models import LLMProgramMessage
from agents.services import LLMProgramChatService
from workouts.models import WorkoutDay
from workouts import services as workout_services
from workouts.test_progression import TODAY, exercise, program, session

pytestmark = pytest.mark.django_db


class WorkoutDate(date):
    @classmethod
    def today(cls):
        return TODAY


def prepare_day(program):
    user, folder, template = program
    template.schedule_config = {"days_of_week": [TODAY.weekday()]}
    template.save()
    weight = exercise(program, name="Повышение веса", reps=12)
    reps = exercise(program, name="Повышение повторов", reps=10)
    hold = exercise(program, name="Недовыполненная цель", reps=10)
    session(
        program,
        TODAY - timedelta(days=7),
        [weight, reps, hold],
        {weight.pk: [(34, 12)] * 3, reps.pk: [(34, 10)] * 3, hold.pk: [(34, 8)] * 3},
    )
    client = APIClient()
    client.force_authenticate(user=user)
    response = client.get("/api/workouts/plan/", {"date": TODAY.isoformat()})
    assert response.status_code == 200
    day = WorkoutDay.objects.get(user=user, date=TODAY)
    return client, day, weight, reps, hold


def log(client, day, te, index, reps):
    response = client.post(
        "/api/workouts/logs/",
        {
            "workout_day": day.pk,
            "template_exercise": te.pk,
            "set_index": index,
            "actual_weight": 34,
            "actual_reps": reps,
        },
        format="json",
    )
    assert response.status_code == 201, response.data


def review(client, folder):
    thread = client.post(
        "/api/llm-agent/threads/", {"program_id": folder.pk}, format="json"
    )
    assert thread.status_code == 201
    thread_id = thread.data["id"]
    response = client.post(
        f"/api/llm-agent/threads/{thread_id}/messages/",
        {
            "message": "Разбери день",
            "mode": "post_workout_review",
            "workout_date": TODAY.isoformat(),
        },
        format="json",
    )
    assert response.status_code == 201, response.data
    return thread_id, response.data["assistant"]


def test_day_completion_two_progressions_and_original_facts_survive_apply(
    program, monkeypatch
):
    monkeypatch.setattr(workout_services, "date", WorkoutDate)
    client, day, weight, reps, hold = prepare_day(program)
    original_plan = deepcopy(day.plan_snapshot)
    monkeypatch.setattr(
        LLMProgramChatService,
        "_call_llm",
        lambda *_: '{"assistant_reply":"Разбор","actions":[]}',
    )
    for te, count, goal in ((weight, 3, 12), (reps, 3, 10), (hold, 2, 8)):
        for index in range(1, count + 1):
            log(client, day, te, index, goal)
    day.refresh_from_db()
    assert day.status == "pending"
    with override_settings(WORKOUT_PROGRESSION_MODE="shadow"):
        _, message = review(client, program[1])
        assert message["actions"] == []
    with override_settings(WORKOUT_PROGRESSION_MODE="active"):
        _, incomplete = review(client, program[1])
        assert {a["template_exercise_id"] for a in incomplete["actions"]} == {
            weight.pk,
            reps.pk,
        }
        log(client, day, hold, 3, 8)
        day.refresh_from_db()
        assert day.status == "completed"
        thread_id, proposal = review(client, program[1])
        changes = {
            a["template_exercise_id"]: a["policy_action"]["changes"]
            for a in proposal["actions"]
        }
        assert changes == {
            weight.pk: {
                "weight": {"from": 34, "to": 36},
                "reps": {"from": 12, "to": 8},
            },
            reps.pk: {"reps": {"from": 10, "to": 11}},
        }
        weight.refresh_from_db()
        reps.refresh_from_db()
        assert weight.weight_override == 34 and weight.rep_override == 12
        assert reps.rep_override == 10
        endpoint = f"/api/llm-agent/threads/{thread_id}/apply/"
        result = client.post(endpoint, {"message_id": proposal["id"]}, format="json")
        assert result.status_code == 200, result.data
        assert len(result.data["applied"]) == 2
        assert not any(
            item.get("status") == "skipped" for item in result.data["applied"]
        )
        assert (
            client.post(
                endpoint, {"message_id": proposal["id"]}, format="json"
            ).status_code
            == 400
        )
    weight.refresh_from_db()
    reps.refresh_from_db()
    hold.refresh_from_db()
    assert (weight.weight_override, weight.rep_override) == (36, 8)
    assert (reps.weight_override, reps.rep_override) == (34, 11)
    assert (hold.weight_override, hold.rep_override) == (34, 10)
    assert LLMProgramMessage.objects.get(pk=proposal["id"]).proposal_status == "applied"
    assert (
        client.get("/api/workouts/plan/", {"date": TODAY.isoformat()}).status_code
        == 200
    )
    day.refresh_from_db()
    assert day.plan_snapshot == original_plan
    assert (
        list(
            day.set_logs.filter(template_exercise=weight)
            .order_by("set_index")
            .values_list("actual_weight", "actual_reps")
        )
        == [(34, 12)] * 3
    )
    next_plan = client.get(
        "/api/workouts/plan/", {"date": (TODAY + timedelta(days=7)).isoformat()}
    )
    assert next_plan.status_code == 200
    next_day = WorkoutDay.objects.get(user=program[0], date=TODAY + timedelta(days=7))
    entries = {
        entry["template_exercise_id"]: entry
        for f in next_day.plan_snapshot["folders"]
        for t in f["templates"]
        for entry in t["exercises"]
    }
    assert (
        entries[weight.pk]["defaults"]["weight"],
        entries[weight.pk]["defaults"]["reps"],
    ) == (36, 8)
    assert entries[reps.pk]["defaults"]["reps"] == 11


def test_day_cannot_complete_with_an_unexpected_set_index(program):
    client, day, weight, reps, hold = prepare_day(program)
    for te in (weight, reps, hold):
        for index in (1, 2, 4):
            log(client, day, te, index, 12)
    day.refresh_from_db()
    assert day.set_logs.count() == 9
    assert day.status == "pending"


def test_started_targets_stay_fixed_while_new_exercises_remain_available(
    program, monkeypatch
):
    monkeypatch.setattr(workout_services, "date", WorkoutDate)
    client, day, weight, reps, hold = prepare_day(program)
    for te in (weight, reps, hold):
        for index in (1, 2, 3):
            log(client, day, te, index, 12)
    day.refresh_from_db()
    assert day.status == "completed"
    weight.weight_override = 36
    weight.rep_override = 8
    weight.save()
    added = exercise(program, name="Новое упражнение", reps=9, weight=20)
    assert (
        client.get("/api/workouts/plan/", {"date": TODAY.isoformat()}).status_code
        == 200
    )
    day.refresh_from_db()
    entries = {
        entry["template_exercise_id"]: entry
        for f in day.plan_snapshot["folders"]
        for t in f["templates"]
        for entry in t["exercises"]
    }
    assert entries[weight.pk]["defaults"]["weight"] == 34
    assert entries[weight.pk]["defaults"]["reps"] == 12
    assert entries[added.pk]["defaults"]["weight"] == 20
    assert day.plan_snapshot["total_sets"] == 12
    assert day.status == "pending"


def test_past_workout_is_not_rebuilt_from_edited_or_disabled_program(program):
    client, day, weight, reps, hold = prepare_day(program)
    log(client, day, weight, 1, 12)
    original = deepcopy(day.plan_snapshot)
    program[1].is_active = False
    program[1].save()
    assert (
        client.get("/api/workouts/plan/", {"date": TODAY.isoformat()}).status_code
        == 200
    )
    day.refresh_from_db()
    assert day.plan_snapshot == original
