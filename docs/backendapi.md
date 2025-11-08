# fitTODOey Backend API

> Базовый URL: `https://{host}` (в dev — `http://localhost:8000`).  
> Для защищённых запросов используется заголовок `Authorization: Token <token>`.

## Аутентификация и профиль

| Метод | Endpoint                  | Описание                                  | Тело запроса |
|-------|---------------------------|-------------------------------------------|--------------|
| POST  | `/api/auth/register/`     | Регистрация + создание профиля            | `{email, password, first_name?, profile:{goal, gender, age, weight_kg, height_cm, level, equipment, health_limitations, preferred_schedule_notes}}` |
| POST  | `/api/auth/login/`        | Логин по email/паролю                     | `{email, password}` |
| GET   | `/api/profile/`           | Текущий профиль                           | — |
| PATCH | `/api/profile/`           | Обновление профиля                        | те же поля, что при регистрации |
| GET   | `/api/profile/prompt/`    | Заготовка промпта для AI (read-only)      | — |

## Exercises

| Метод | Endpoint                        | Описание                                  |
|-------|---------------------------------|-------------------------------------------|
| GET   | `/api/exercises/`               | Системный каталог (поиск по `?q=` или `?muscles=`) |
| GET   | `/api/exercises/custom/`        | Персональные упражнения пользователя      |
| POST  | `/api/exercises/custom/`        | Создать кастомное упражнение              |
| GET/PATCH/DELETE | `/api/exercises/custom/{id}/` | Управление конкретным кастомным упражнением |

## Programs & Templates

| Метод | Endpoint                              | Описание                                                            |
|-------|---------------------------------------|---------------------------------------------------------------------|
| GET/POST | `/api/programs/folders/`           | Список папок / создание новой (поля: name, comment, is_active)      |
| PATCH/DELETE | `/api/programs/folders/{id}/`  | Обновление/удаление папки                                          |
| GET/POST | `/api/programs/templates/?folder={id}` | Шаблоны дня. Поля: `name`, `schedule_type`, `schedule_config`, `template_exercises[]`. |
| GET/PATCH/DELETE | `/api/programs/templates/{id}/` | Управление шаблоном                                                |
| GET/POST | `/api/programs/template-exercises/?template={id}` | Добавление упражнений в шаблон с override-полями (`weight_override`, `rep_override`, `note` и т.д.) |

## Workouts

| Метод | Endpoint                     | Описание                                                                 |
|-------|------------------------------|--------------------------------------------------------------------------|
| GET   | `/api/workouts/plan/?date=YYYY-MM-DD` | Генерация чеклиста на день. Возвращает `WorkoutDay` и `plan_snapshot`. |
| POST  | `/api/workouts/logs/`        | Запись фактического сета: `{workout_day, template_exercise, set_index, actual_reps?, actual_weight?, actual_time?}` |
| DELETE| `/api/workouts/logs/{id}/`   | Удаление лога (пересчёт статуса дня)                                    |

## Analytics & AI

| Метод | Endpoint                      | Описание                                         |
|-------|-------------------------------|--------------------------------------------------|
| GET   | `/api/analytics/days/?start=&end=` | Нагрузка по дням (журнал `weight * reps`, либо эквивалент времени). |
| GET   | `/api/analytics/exercises/`   | Нагрузка по упражнениям, количество сетов        |
| GET   | `/api/analytics/ai-feed/`     | Placeholder: последние логи для генерации рекомендаций |

## Статусы и ошибки

- Успешные ответы: `200 OK` / `201 Created`, содержат JSON.
- Валидация: `400 Bad Request` с пояснением (`{"non_field_errors": [...]}`).
- Неавторизованные запросы: `401 Unauthorized`.
- Если папка/шаблон принадлежит другому пользователю — `403 Forbidden`.

## Импорт данных

```bash
python manage.py import_exercises --truncate  # заполняет модель Exercise из docs/exercise.csv
```

## Дополнительно

- Swagger/Schema не подключён, но можно использовать `python manage.py generateschema` (стандартный DRF).
- Token Auth реализован через `rest_framework.authtoken`. Для logout достаточно удалить токен на клиенте.
