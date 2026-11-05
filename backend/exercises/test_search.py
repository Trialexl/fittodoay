import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from workouts.models import Exercise_DB, ExerciseMuscle
from exercises.search import search_catalog
from agents.tools import ProgramReadTools

pytestmark = pytest.mark.django_db


def exercise(pk, name, *, muscle="Широчайшие", equipment="dumbbell", secondary=False):
    item = Exercise_DB.objects.create(
        id=pk, name_ru=name, name_en=pk.replace("_", " "), equipment_en=equipment
    )
    ExerciseMuscle.objects.create(
        exercise=item, name_ru=muscle, name_en="", is_primary=not secondary
    )
    return item


@pytest.fixture
def catalog():
    correct = exercise("One_Arm_Dumbbell_Row", "Тяга гантели в наклоне одной рукой")
    exercise(
        "Wrong_Equipment", "Тяга штанги в наклоне одной рукой", equipment="barbell"
    )
    exercise("Wrong_Muscle", "Тяга гантели одной рукой к подбородку", muscle="Плечи")
    exercise("Secondary", "Тяга гантелей", secondary=True)
    return correct


def test_keywords_muscles_equipment_are_joint_constraints(catalog):
    rows = search_catalog(
        query="тяга гантели",
        muscles="широчайшие",
        equipment="гантели",
        primary_only=True,
    )
    assert [item.pk for item in rows.exercises] == [catalog.pk]
    assert rows.total == 1
    assert (
        search_catalog(
            query="тяга", muscles="широчайшие", equipment="гантели", primary_only=False
        ).total
        == 2
    )
    assert (
        search_catalog(
            query="тяга", muscles="широчайшие", exclude_equipment=["dumbbell"]
        ).total
        == 1
    )


def test_query_order_aliases_and_yo(catalog):
    assert (
        catalog in search_catalog(query="тяга гантели одной рукой в наклоне").exercises
    )
    assert (
        catalog in search_catalog(query="dumbbell row", muscles="широчайшие").exercises
    )
    press = exercise("Press", "Жим гантелей лёжа", muscle="Грудь")
    assert search_catalog(query="жим гантелей лежа").exercises == [press]


def test_no_alphabet_fallback_and_empty_filter_results(catalog):
    assert search_catalog(query="несуществующее движение").total == 0
    assert search_catalog(muscles="пресс", equipment="гантели").total == 0


def test_ui_mcp_and_internal_tools_share_search(catalog):
    user = get_user_model().objects.create_user(
        email="search@example.test", password="test"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    params = {
        "q": "тяга гантели",
        "muscles": "широчайшие",
        "equipment": "гантели",
        "primary_only": "true",
    }
    response = client.get("/api/exercises/", params)
    assert response.status_code == 200
    assert [item["id"] for item in response.data] == [catalog.pk]
    tools = ProgramReadTools(user)
    result = tools.execute(
        "search_exercises",
        {
            "query": params["q"],
            "muscles": params["muscles"],
            "equipment": params["equipment"],
            "primary_only": True,
        },
    )
    assert [item["id"] for item in result["results"]] == [catalog.pk]
    assert "primary_muscles" in result["results"][0]
    assert result["results"][0]["equipment"] == "dumbbell"


def test_paging_preserves_total_and_validates_window(catalog):
    user = get_user_model().objects.create_user(email="window@example.test")
    tools = ProgramReadTools(user)
    first = tools.execute("search_exercises", {"limit": 1})
    second = tools.execute("search_exercises", {"limit": 1, "offset": 1})
    assert first["total"] == second["total"] == 4
    assert first["results"][0]["id"] != second["results"][0]["id"]
    assert (
        tools.execute("search_exercises", {"limit": 1000})["error"]
        == "invalid_arguments"
    )
    assert (
        tools.execute("search_exercises", {"user_id": 1})["error"]
        == "invalid_arguments"
    )


def test_secondary_muscle_participates_by_default_in_api_and_assistant():
    row = exercise(
        "One-Arm_Dumbbell_Row",
        "Тяга гантели в наклоне одной рукой",
        muscle="Средняя спина",
    )
    ExerciseMuscle.objects.create(
        exercise=row, name_ru="Широчайшие", name_en="lats", is_primary=False
    )
    user = get_user_model().objects.create_user(email="secondary-search@example.test")
    params = {
        "query": "тяга гантели одной рукой",
        "muscles": "широчайшие",
        "equipment": "гантели",
    }
    tool = ProgramReadTools(user)
    result = tool.execute("search_exercises", params)
    assert [item["id"] for item in result["results"]] == [row.pk]
    assert result["filters"]["primary_only"] is False
    assert result["results"][0]["primary_muscles"] == ["Средняя спина"]
    assert result["results"][0]["secondary_muscles"] == ["Широчайшие"]
    assert (
        tool.execute("search_exercises", {**params, "primary_only": True})["total"] == 0
    )
    client = APIClient()
    client.force_authenticate(user=user)
    response = client.get(
        "/api/exercises/",
        {
            "q": params["query"],
            "muscles": params["muscles"],
            "equipment": params["equipment"],
        },
    )
    assert response.status_code == 200
    assert [item["id"] for item in response.data] == [row.pk]


def test_primary_match_ranks_higher_but_exact_secondary_name_is_preserved():
    primary = exercise("primary", "Тяга гантели широким хватом")
    secondary = exercise("secondary", "Тяга гантели узким хватом", secondary=True)
    result = search_catalog(
        query="тяга гантели", muscles="широчайшие", equipment="гантели"
    )
    assert [item.pk for item in result.exercises] == [primary.pk, secondary.pk]
    assert (
        search_catalog(query=secondary.name_ru, muscles="широчайшие").exercises[0].pk
        == secondary.pk
    )
