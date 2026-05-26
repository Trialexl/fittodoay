# fitTODOay Backend API

> Базовый URL: `https://{host}` (dev: `http://localhost:8000`).  
> Авторизация: заголовок `Authorization: Token <token>`.

## 1. Аутентификация и профиль

### POST `/api/auth/register/`
| Поле | Тип | Описание |
|------|-----|----------|
| `email` | string | уникальный email |
| `password` | string | минимум 8 символов |
| `first_name` | string, optional |
| `profile.goal` | enum(`cut`,`strength`,`hypertrophy`,`endurance`) |
| `profile.gender` | enum(`male`,`female`,`other`) |
| `profile.age` | integer |
| `profile.weight_kg` | decimal |
| `profile.height_cm` | decimal |
| `profile.level` | enum(`beginner`,`intermediate`,`advanced`) |
| `profile.equipment` | string |
| `profile.health_limitations` | string |
| `profile.preferred_schedule_notes` | string |

**Пример:**
```json
{
  "email": "user@example.com",
  "password": "Secret123",
  "profile": {
    "goal": "strength",
    "gender": "male",
    "age": 28,
    "weight_kg": 78.5,
    "height_cm": 182,
    "level": "intermediate",
    "equipment": "гантели, штанга",
    "health_limitations": "",
    "preferred_schedule_notes": "Пн/Ср/Пт"
  }
}
```
**Ответ:** `201` `{ "token": "...", "user": {...} }`

### POST `/api/auth/login/`
```json
{ "email": "user@example.com", "password": "Secret123" }
```

### GET `/api/profile/`
Возвращает объект профиля (как в `profile` выше).

### PATCH `/api/profile/`
```json
{ "equipment": "гантели, турник", "goal": "cut" }
```

### GET `/api/profile/prompt/`
Ответ: `{ "prompt": "..." }`

### GET `/api/profile/preferences/`
Возвращает сохранённые параметры для LLM-визарда:
```json
{
  "gender": "male",
  "age": 32,
  "weight_kg": 82.5,
  "goal": "strength",
  "sessions_per_week": 4,
  "session_duration": 60,
  "notes": "Предпочитаю тренажеры и короткие разминки"
}
```

### PUT `/api/profile/preferences/`
Передавайте любые поля (все optional) для обновления:
```json
{
  "gender": "female",
  "goal": "cut",
  "sessions_per_week": 5,
  "notes": "Новичок, нужно беречь спину"
}
```
Ответ — актуальное состояние как в `GET`.

---

## 2. Exercises

### GET `/api/exercises/`
Параметры: `?q=` (поиск по названию), `?muscles=` (по целевым мышцам).

### CustomExercise
- **GET/POST `/api/exercises/custom/`**
- **Модель:**
```json
{
  "id": 5,
  "name": "Отжимания с хлопком",
  "target_muscles": "грудь/трицепс",
  "has_weight": false,
  "has_time": false,
  "default_reps": 15,
  "default_sets": 3,
  "default_rest": 60,
  "base_exercise": 1
}
```

---

## 3. Программы и шаблоны

### ProgramFolder (`/api/programs/folders/`)
- Для каждого пользователя при регистрации автоматически создаётся папка **«Основные»** (собственная, можно переименовать или выключить).
```json
{
  "id": 1,
  "name": "Основные",
  "comment": "Базовая программа",
  "is_active": true,
  "sort_order": 0
}
```

### DayTemplate (`/api/programs/templates/`)

| Поле | Тип | Описание |
|------|-----|----------|
| `folder` | integer | ID папки |
| `name` | string |
| `comment` | string |
| `is_active` | boolean |
| `schedule_type` | enum(`weekly`,`biweekly`,`interval`,`custom`) |
| `schedule_config` | JSON (см. ниже) |
| `sort_order` | integer |
| `template_exercises` | массив TemplateExercise |

**schedule_config форматы:**
- weekly: `{"days_of_week": [0,2,4]}` (0=понедельник)
- biweekly: `{"start_date": "2024-01-01", "week_interval": 2, "days_of_week": [1,4]}`
- interval: `{"start_date": "2024-01-01", "every_x_days": 3}`
- custom: `{"specific_dates": ["2024-01-05","2024-01-12"]}`

**TemplateExercise объект:**
```json
{
  "exercise_id": 10,
  "custom_exercise_id": null,
  "sort_order": 1,
  "weight_override": 60,
  "rep_override": 8,
  "set_override": 4,
  "time_override": null,
  "rest_override": 90,
  "note": "Разминка 2 подхода"
}
```

---

## 4. Workouts

### GET `/api/workouts/plan/?date=2024-06-01`
Ответ:
```json
{
  "id": 12,
  "date": "2024-06-01",
  "plan_snapshot": {
    "folders": [
      {
        "id": 1,
        "name": "Основные",
        "templates": [
          {
            "id": 3,
            "name": "Понедельник",
            "exercises": [
              {
                "template_exercise_id": 21,
                "source": {
                  "type": "system",
                  "id": 10,
                  "name": "Жим лежа",
                  "description": "Лягте на скамью, опустите штангу до груди и выжмите вверх.",
                  "target_muscles": "грудь/трицепс",
                  "difficulty": "Средний"
                },
                "defaults": {
                  "reps": 10,
                  "sets": 4,
                  "weight": 60,
                  "rest": 90
                },
                "sets": [
                  { "set_index": 1, "default_reps": 10, "default_weight": 60 },
                  { "set_index": 2, "default_reps": 10, "default_weight": 60 }
                ]
              }
            ]
          }
        ]
      }
    ],
    "total_sets": 8
  }
}
```

### POST `/api/workouts/logs/`
```json
{
  "workout_day": 12,
  "template_exercise": 21,
  "set_index": 1,
  "actual_reps": 10,
  "actual_weight": 60,
  "actual_time": null
}
```

---

### GET `/api/workouts/recommendations/?date=2024-06-01`
Возвращает предполагаемые корректировки по каждой программе (если все подходы выполнены).
```json
{
  "date": "2024-06-01",
  "folders": [
    {
      "folder_id": 1,
      "folder_name": "Основные",
      "recommendations": [
        {
          "template_exercise_id": 21,
          "exercise_name": "Тяга штанги в наклоне",
          "template_name": "День 3",
          "current_reps": 10,
          "current_weight": 20,
          "average_reps": 12.0,
          "average_weight": 20.0,
          "suggested_reps": 8,
          "suggested_weight": 22.0,
          "has_weight": true,
          "reason": "Повторы вышли на 12.0 (RIR≈4.0) — повышаем вес и начинаем новый цикл с 8 повторений.",
          "action": "increase_weight",
          "estimated_rir": 4.0
        }
      ]
    }
  ]
}
```

Поле `action` может принимать значения:
- `increase_weight` — поднять вес и начать новый цикл с 8 повторений;
- `decrease_weight` — снизить вес и удерживать диапазон 8–12;
- `adjust_reps_down` — временно снизить целевое число повторов, если в нижней границе диапазона;
- `increase_reps_after_weight` — продолжить наращивать повторения на текущем весе;
- `align_weight` — зафиксировать фактический средний вес, если он выше плана;
- `reduce_weight_to_actual` — опустить план до фактического среднего веса, если пользователь не держит прежний уровень;
- `info_low_reps` — информационный совет сфокусироваться на технике, без автоматической корректировки;
- `adjust_reps` — скорректировать цель по повторам для упражнений без веса.

Каждая рекомендация содержит флаг `informational` — если `true`, поля `suggested_*` могут быть пустыми и это просто текстовое сообщение.

### POST `/api/workouts/recommendations/apply/`
Применяет выбранные значения к `TemplateExercise`.
```json
{
  "date": "2024-06-01",
  "items": [
    { "template_exercise_id": 21, "rep_override": 8, "weight_override": 22.0 }
  ]
}
```
Ответ: `{ "updated": 1 }`.

---

## 5. Проверка техники по видео

Раздел использует загруженное пользователем видео и vision-модель OpenRouter. Фронтенд работает с `/technique-review`, весь анализ и ключи остаются на backend.

### GET `/api/technique-reviews/`
Возвращает последние проверки текущего пользователя.

**Ответ:**
```json
{
  "items": [
    {
      "id": 14,
      "status": "completed",
      "exercise": {
        "id": "Bodyweight_Squat",
        "name": "Приседания",
        "name_en": "Bodyweight Squat",
        "name_ru": "Приседания"
      },
      "detected_exercise_name": "Приседания",
      "detected_exercise_confidence": 0.91,
      "video_filename": "squat-8377a37bc502.mp4",
      "score": 72,
      "summary": "Колени уходят внутрь в нижней фазе.",
      "error_code": "",
      "created_at": "2026-05-26T12:00:00Z",
      "updated_at": "2026-05-26T12:00:04Z"
    }
  ]
}
```

### POST `/api/technique-reviews/`
Создаёт проверку. В режиме `DJANGO_TECHNIQUE_ANALYSIS_MODE=sync` backend сразу запускает анализ в HTTP-запросе; в режиме `async` возвращает `processing`, а результат подхватывает worker `process_technique_reviews`.

**Content-Type:** `multipart/form-data`

| Поле | Тип | Описание |
|------|-----|----------|
| `video` или `video_file` | file | `mp4`, `mov`, `webm` или `m4v`; лимиты задаются `DJANGO_TECHNIQUE_VIDEO_MAX_MB` и `DJANGO_TECHNIQUE_VIDEO_MAX_SECONDS` |

Если пользователь превысил `DJANGO_TECHNIQUE_REVIEW_DAILY_LIMIT`, endpoint возвращает `429`:
```json
{
  "message": "Дневной лимит проверок техники исчерпан. Попробуйте завтра.",
  "error_code": "rate_limited"
}
```

**Ответ `201`:**
```json
{
  "id": 15,
  "status": "needs_confirmation",
  "exercise": null,
  "detected_exercise_name": "Приседания",
  "detected_exercise_confidence": 0.62,
  "video_filename": "squat-8377a37bc502.mp4",
  "score": 58,
  "summary": "Похоже на приседание, но нужно подтвердить упражнение.",
  "error_code": "",
  "result_json": {
    "score": 58,
    "summary": "Похоже на приседание, но нужно подтвердить упражнение.",
    "issues": [
      {
        "title": "Колени заваливаются внутрь",
        "severity": "medium",
        "evidence": "В нижней фазе колени смещаются к центру.",
        "fix": "Разводите колени по линии носков."
      }
    ],
    "next_set_focus": [
      "Поставьте стопы чуть шире плеч.",
      "Сохраняйте корпус напряжённым перед спуском."
    ],
    "positive_notes": [],
    "camera_feedback": [],
    "detected_exercise": {
      "name": "Приседания",
      "catalog_exercise_id": "Bodyweight_Squat",
      "confidence": 0.62,
      "alternatives": []
    }
  },
  "created_at": "2026-05-26T12:00:00Z",
  "updated_at": "2026-05-26T12:00:04Z"
}
```

Возможные `status`:
- `processing` — запись создана, анализ ещё не завершён;
- `needs_confirmation` — упражнение определено с низкой уверенностью, пользователю нужно подтвердить;
- `completed` — анализ готов;
- `failed` — анализ недоступен, `error_code` содержит причину.

### GET `/api/technique-reviews/{id}/`
Возвращает одну проверку текущего пользователя. Чужие проверки не доступны.

### DELETE `/api/technique-reviews/{id}/`
Удаляет проверку текущего пользователя и связанный видеофайл.

**Ответ:** `204 No Content`.

### POST `/api/technique-reviews/{id}/confirm-exercise/`
Переанализирует видео после ручного подтверждения упражнения.

**Запрос:**
```json
{
  "exercise_id": "Bodyweight_Squat"
}
```

**Ответ:** актуальный объект проверки, как в `POST /api/technique-reviews/`.

Для очистки старых видео есть management command:
```bash
python manage.py cleanup_technique_reviews --days 30
python manage.py cleanup_technique_reviews --days 30 --dry-run
```

`--days` по умолчанию берётся из `DJANGO_TECHNIQUE_VIDEO_RETENTION_DAYS`.

Для async-режима анализа:
```bash
python manage.py process_technique_reviews
python manage.py process_technique_reviews --once
```

В Docker `backend` и `technique-worker` должны использовать общий `DJANGO_MEDIA_ROOT` (`/data/media`), иначе worker не сможет открыть загруженное видео.

---

## 6. Analytics & AI

### GET `/api/analytics/days/?start=2024-06-01&end=2024-06-07`
```json
{
  "start": "2024-06-01",
  "end": "2024-06-07",
  "items": [
    {"date": "2024-06-01", "load": 640},
    {"date": "2024-06-02", "load": 120}
  ]
}
```

### POST `/api/llm-agent/programs/`
Создаёт программы через LLM-помощника. Тело запроса повторяет поля из `/api/profile/preferences/` (можно передавать частично):
```json
{
  "gender": "male",
  "goal": "strength",
  "sessions_per_week": 4,
  "session_duration": 60,
  "notes": "Только тренажеры, без прыжков"
}
```
Ответ `201`:
```json
{
  "created_programs": [
    {"id": 10, "name": "Сила", "templates": 3, "is_active": true}
  ],
  "active_program_id": 10,
  "raw_plan": { "programs": [...] }
}
```
При недоступности LLM возвращает `503`:
```json
{
  "detail": "assistant_unavailable",
  "message": "На данный момент создание через помощника недоступно..."
}
```

### GET `/api/analytics/exercises/`
```json
[
  {"id": "sys:10", "name": "Жим лежа", "type": "system", "load": 780, "sets": 6},
  {"id": "custom:3", "name": "Планка", "type": "custom", "load": 45, "sets": 3}
]
```

### GET `/api/analytics/ai-feed/`
Ответ: массив последних логов (дата, упражнение, фактические значения, рассчитанная нагрузка).

### GET `/api/analytics/program-trends/?range=month&granularity=week`
Агрегированная динамика по папкам и их упражнениям.
```json
{
  "start": "2024-05-01",
  "end": "2024-05-31",
  "granularity": "week",
  "folders": [
    {
      "id": 1,
      "name": "Основные",
      "series": [
        { "date": "2024-05-06", "load": 150.0 },
        { "date": "2024-05-13", "load": 180.0 }
      ],
      "exercises": [
        {
          "template_exercise_id": 21,
          "exercise_name": "Тяга гири",
          "template_name": "Full Body",
          "series": [
            { "date": "2024-05-06", "load": 60.0 },
            { "date": "2024-05-13", "load": 70.0 }
          ]
        }
      ]
    }
  ]
}
```
Параметры: `range=week|month|half-year|year`, `granularity=day|week`.

---

## 6. Статусы и ошибки
- `200/201 OK` — успешные ответы.
- `400 Bad Request` — проблемы валидации.
- `401 Unauthorized` — отсутствует/неверный токен.
- `403 Forbidden` — попытка работать с чужими ресурсами.

---

## 7. Импорт данных
`python manage.py import_exercise_db --truncate` — загружает `docs/exercises/exercises_ru_all.json` в каталог `Exercise_DB`.
