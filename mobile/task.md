# Миграция web → mobile (fitTODOay)

Статусы: `[x]` сделано в `mobile/FitTodoayMobile`, `[ ]` — требуется для полного паритета с веб (папка `frontend`).

## A. Базовые потоки и инфраструктура
- [x] Логин/авторегистрация по email+паролю с дефолтным профилем (`mobile/FitTodoayMobile/src/screens/Auth/LandingScreen.tsx`, `utils/profileDefaults.ts`) — паритет с `frontend/src/app/page.tsx`.
- [x] Онбординг со сбором профиля и регистрацией (`screens/Auth/OnboardingScreen.tsx`) — соответствует `components/onboarding/OnboardingWizard.tsx`.
- [x] Провайдеры: QueryClient, хранение токена, офлайн-баннер, темы (`App.tsx`, `state/auth.ts`, `hooks/useOnline.ts`, `components/OfflineBanner.tsx`) — аналог `AppProviders`, `useOffline`.
- [ ] Выровнять HTTP‑клиент с `@fittodoay/shared`: обработка 401/403 и повторное оповещение logout как в `frontend/src/lib/api.ts`/`state/authEvents.ts` (сейчас только `clearSession`).

## B. Чеклист тренировки (Workout)
- [x] Загрузка плана по дате, календарь с нагрузкой, метки мышц (`screens/WorkoutScreen.tsx` vs `app/workout/page.tsx` + `WorkoutCalendar`).
- [x] Выполнение сетов с таймерами отдыха/выполнения, автозавершение таймеров, ввод факта, модалка редактирования и удаления лога (`components/RestTimerOverlay.tsx`, `ExecutionOverlay.tsx`) — паритет с `Checklist`.
- [x] Офлайн-очередь логов + баннер синхронизации (`state/offlineQueue.ts`, `WorkoutScreen`), аналог `useOfflineWorkoutQueue`.
- [x] Просмотр описания/картинок упражнения (info-модалка) — как в веб `Checklist`.
- [ ] Рекомендации дня: выровнять с веб-флоу (`frontend/src/components/workout/Checklist.tsx`):
  - получать рекомендации по дате/папке (эндпоинт `/api/workouts/recommendations/?date=`),
  - группировать по папкам, показывать reason/RIR, автоподстановка предложенных rep/weight,
  - отправлять применяемые элементы пачкой `{date, items: [...]}` на `/recommendations/apply/`,
  - блокировать кнопку до выбора значений и отображать состояние применения/ошибки.
- [ ] Проверить автозакрытие свёрток при завершении упражнения/шаблона (в веб коллапсится автоматически) и дотянуть логику, если поведение отличается.

## C. Программы (ProgramBoard)
- [x] CRUD папок: имя/комментарий/активация/удаление, защита базовой папки (`ProgramsScreen` ↔ `ProgramBoard`).
- [x] Создание/редактирование шаблонов с типами расписания weekly/biweekly/interval/custom и конфигом (UI на строках ~700+, мутации `createTemplate`/`updateTemplate`) — аналог `TemplateEditor`.
- [x] Перетаскивание упражнений внутри шаблона (react-native-draggable-flatlist fallback) — паритет dnd-kit.
- [x] CRUD упражнений шаблона: выбор из каталога, оверрайды сетов/повторов/веса/времени/отдыха, заметка, переключение активности, сортировка (`exerciseModal` блоки) — соответствует `TemplateExerciseModal`.
- [x] Чат с ассистентом по программе: создание треда, список сообщений, применение действий (`createThread`/`fetchThreadMessages`/`applyThreadActions`) — аналог модалки в `ProgramBoard`.
- [ ] Поддержать кастомные упражнения наравне с системными (в веб `custom_exercise` есть в карточках): добавить форму создания/редактирования кастомного упражнения и выбор его вместо системного.
- [ ] Проверить сериализацию/валидацию `schedule_config` против веб (`TemplateEditor` валидирует дни/интервалы, автогенерирует название по конфигу) и дотянуть одинаковые ошибки/дефолты.
- [ ] Добавить предпросмотр описания/картинок упражнения в модалке выбора (в веб в `TemplateExerciseModal` отображаются target_muscles/difficulty/images).

## D. Ассистент (LLM)
- [x] Визард предпочтений с подгрузкой сохранённых prefs, сохранением через `/api/profile/preferences/` и запросом `/api/llm-agent/programs/` (кнопка fallback при 503/invalid JSON) — соответствует `app/assistant/page.tsx`.
- [x] Вывод сгенерированных программ, переходы к ProgramBoard/Workout.
- [ ] Добавить шаг подтверждения активной программы/количества шаблонов, если бэкенд вернёт `created_programs`/`active_program_id` как в веб (сейчас выводим только `programs` из мобильного API-типа).

## E. Аналитика
- [x] Дневная нагрузка и переход к чеклисту по дате (`fetchDailyLoad` + навигация) — как `AnalyticsPanels`/`ProgramTrendPanel` кнопки.
- [x] Топ упражнений с сортировкой по объёму/сетам.
- [x] Графики трендов по программам/упражнениям с диапазоном, гранулярностью и типами чарта (line/area/stacked/columns/heatmap/pie/radar/scatter) — паритет набора опций в `ProgramTrendPanel`.
- [ ] Проверить расчёт нагрузки/серий на совпадение с веб API (`/api/analytics/program-trends/` формирует `series` с `load`), выровнять отображение tooltip/легенды и цвета с веб, добавить загрузку/ошибки для пустых данных.

## F. Общие задачи качества
- [ ] Пройтись по всем экранам мобильной версии регрессионно против веб-UI (навигация, стейты загрузки/ошибок, пустые состояния).
- [ ] Настроить единый `.env`/config для mobile с теми же переменными, что использует веб (`NEXT_PUBLIC_API_URL` ↔ `config.apiUrl`), и зафиксировать в README.
- [ ] Добавить e2e/интеграционные тесты ключевых потоков (логин, чеклист, рекомендации, ProgramBoard CRUD, ассистент, аналитика) — аналог тест-плана в `docs/test-plan.md` (раздел LLM).
