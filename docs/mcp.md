# Fittoday OAuth MCP

Fittoday публикует MCP transport, OAuth authorization server и Django API из
одного Uvicorn ASGI-процесса.

## Production-домен

Укажите реальный публичный домен в корневом production-окружении:

```dotenv
DOMAIN=<реальный-домен>
```

Compose передаст его backend как `APP_DOMAIN`. Остальные публичные адреса
вычисляются автоматически:

- OAuth issuer: `https://<DOMAIN>`
- MCP server/resource: `https://<DOMAIN>/mcp`

`MCP_ISSUER_URL` и `MCP_PUBLIC_URL` нужны только как overrides для локальной
разработки и тестов. В production достаточно одного `DOMAIN`.

Пока реальный домен неизвестен, `.codex/config.toml` намеренно не содержит
активной секции `mcp_servers.fittoday`, а Skill metadata не содержит MCP URL.

## Подключение через Codex Desktop

После назначения домена и публикации backend:

1. Откройте **Settings → MCP servers → Add server**.
2. Выберите тип **Streamable HTTP**.
3. Укажите URL `https://<DOMAIN>/mcp`.
4. Выполните **Restart**, затем нажмите **Authenticate**.
5. В открывшемся браузере войдите в Fittoday.
6. Проверьте запрошенные scopes и подтвердите доступ.

Codex получает access/refresh credentials через OAuth. Копировать DRF token,
пароль или client secret в настройки, Skill либо промпт не требуется.

## Альтернативная конфигурация Codex

После назначения домена можно настроить тот же сервер в `.codex/config.toml`:

```toml
mcp_oauth_credentials_store = "keyring"

[mcp_servers.fittoday]
url = "https://<DOMAIN>/mcp"
auth = "oauth"
scopes = ["fittoday.read", "fittoday.write"]
oauth_resource = "https://<DOMAIN>/mcp"
default_tools_approval_mode = "writes"
```

После добавления сервера OAuth-авторизацию также можно начать из CLI:

```shell
codex mcp login fittoday
```

Значение `<DOMAIN>` в этом разделе является только примером. Не копируйте
конфигурацию с placeholder как активный MCP-сервер. После назначения домена
замените placeholder реальным адресом одновременно:

- в `.codex/config.toml`;
- в `.agents/skills/manage-fittoday-training/agents/openai.yaml`.

## Поток данных

| Область | Модель | Существующий API/бизнес-слой | MCP tools |
| --- | --- | --- | --- |
| Profile | `UserProfile` | profile serializer/view | `get_profile` |
| Exercises | `Exercise_DB`, `CustomExercise` | exercise serializers/views | search/get catalog and CRUD custom exercises |
| Programs | `ProgramFolder`, `DayTemplate`, `TemplateExercise` | program serializers/viewsets | program/day/exercise CRUD, reorder, atomic program creation |
| Workouts | `WorkoutDay`, `WorkoutSetLog`, `WorkoutWeighIn` | workout serializers/views/services | plan/logs, set upsert, weigh-in upsert, recommendations |
| Analytics | workout and program aggregates | analytics services/views | daily, exercise, weight and program trends |

Tools не принимают URL, path, HTTP method, token или user ID. Пользователь
определяется по OAuth subject. Большинство tools вызывает фиксированные
allowlisted loopback API-маршруты с 60-секундным delegated JWT. Атомарные
многообъектные операции используют общий domain service.

## Хранение и очистка OAuth-состояния

База хранит зарегистрированные public clients, ожидающие consent requests,
одноразовые authorization codes и записи access/refresh tokens. Коды и токены
хранятся только как SHA-256-хэши. Refresh exchange ротирует refresh token и
отзывает предыдущую access-token family.

Просроченные записи старше семи дней удаляются при новом authorization request.
Также можно запускать команду по расписанию:

```shell
python manage.py cleanup_mcp_oauth
```

Codex хранит клиентские OAuth credentials в системном keyring. API tokens,
пароли и OAuth client secrets не должны попадать в репозиторий или Skill.
