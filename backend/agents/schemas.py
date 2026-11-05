"""Wire schemas plus independent server validation; provider output is never trusted."""


def obj(properties):
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


def response_format(name, schema):
    return {
        "type": "json_schema",
        "json_schema": {"name": name, "strict": True, "schema": schema},
    }


nullable_string = {"type": ["string", "null"]}
nullable_number = {"type": ["number", "null"]}
nullable_int = {"type": ["integer", "null"]}
action_properties = {
    "type": {
        "type": "string",
        "enum": [
            "add_exercise",
            "replace_exercise",
            "remove_exercise",
            "update_weight",
            "create_custom_exercise",
        ],
    },
    **{
        key: nullable_int
        for key in (
            "program_id",
            "day_id",
            "template_exercise_id",
            "deactivate_exercise_id",
            "custom_exercise_id",
            "sets",
            "reps",
            "time",
            "rest",
            "default_sets",
            "default_reps",
            "default_time",
            "default_rest",
        )
    },
    **{
        key: nullable_string
        for key in (
            "day_name",
            "exercise_id",
            "exercise_name",
            "target_muscles",
            "description",
            "note",
        )
    },
    "weight": nullable_number,
    "default_weight": nullable_number,
    "has_weight": {"type": ["boolean", "null"]},
    "has_time": {"type": ["boolean", "null"]},
}
CHAT_FORMAT = response_format(
    "program_reply",
    obj(
        {
            "assistant_reply": {"type": "string"},
            "actions": {
                "type": "array",
                "items": obj(action_properties),
            },
        }
    ),
)
exercise = obj(
    {
        "exercise_id": {"type": "string"},
        "sets": {"type": "integer"},
        "reps": nullable_int,
        "weight": nullable_number,
        "time": nullable_int,
        "rest": nullable_int,
        "note": {"type": "string"},
    }
)
day = obj(
    {
        "name": {"type": "string"},
        "comment": {"type": "string"},
        "schedule_type": {"type": "string", "enum": ["weekly"]},
        "schedule_config": obj(
            {"days_of_week": {"type": "array", "items": {"type": "integer"}}}
        ),
        "exercises": {"type": "array", "items": exercise},
    }
)
program = obj(
    {
        "name": {"type": "string"},
        "comment": {"type": "string"},
        "days": {"type": "array", "items": day},
    }
)
PLAN_FORMAT = response_format(
    "training_plan",
    obj({"programs": {"type": "array", "items": program}}),
)
