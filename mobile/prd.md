# fitTODOay — Mobile PRD (Flutter 3.x)

## 1. Цель
- Создать нативное мобильное приложение для iOS и Android на Flutter 3.x.
- Повторить ключевые сценарии веб-клиента: онбординг, управление программами, чеклист тренировок с офлайн-логированием и таймером, аналитика и LLM-ассистент.
- Разделить переиспользуемую логику (API, стораджи, типы) в shared-модуль для совместного использования web и mobile.

## 2. Архитектура
- **Монорепо:** `frontend/` (Next.js), `mobile/` (Flutter), `packages/shared/` (переиспользуемый код). Shared можно вынести позже.
- **Стек mobile:** Flutter 3.x + Material 3; маршрутизация через `go_router` или `Navigator 2.0`, стейт-менеджмент `Riverpod`/`Bloc`; анимации и жесты — стандартные Flutter widgets/animations.
- **Графики:** `charts_flutter`/`fl_chart` + `flutter_svg`. Drag&drop/свайпы — через `ReorderableListView`, `Dismissible` и кастомную логику.
- **Сеть:** HTTP-клиент `dio` или `http`, хранение токена в `flutter_secure_storage`/`shared_preferences`. Общие типы/ендпоинты — синхронизируем с backend.
- **Офлайн:** локальная очередь логов в `shared_preferences`/`isar`/`hive`, слушаем `connectivity_plus`. Таймер и чеклист должны работать без сети.

## 3. Сценарии
1. **Auth / Onboarding:** экраны входа и пошагового онбординга (wizard). После регистрации — переход к программам.
2. **Program Board:** список папок/шаблонов с drag&drop reorder, CRUD папок/шаблонов, модальные редакторы упражнений.
3. **Workout Checklist:** отображение плана, отметка сетов, офлайн-сохранение и синхронизация, RestTimer fullscreen с блокировкой жестов, баннер «Нет соединения».
4. **Analytics:** карточки нагрузки, топы упражнений, график «Динамика по программам», блок AI-рекомендаций.
5. **LLM Assistant:** wizard ввода предпочтений, запуск `/api/llm-agent/programs/`, отображение созданных программ (как на web).

## 4. Навигация и UI
- Используем `go_router` или `AutoRoute` + BottomNavigationBar (Основные вкладки: Programs, Workout, Analytics, Assistant, Profile).
- Стили через `ThemeData`/Design System; варианты — `flutter_hooks` + `hooks_riverpod` или `bloc`.
- Модальные окна — `showModalBottomSheet` + кастомные анимации.
- Поддержка тёмной темы через `ThemeMode` (roadmap).

## 5. Интеграция с backend
- API полностью совпадает с вебом (`/api/...`). Конфигурация `API_BASE_URL` задаётся через `app.config.ts` (`extra.apiBaseUrl`) и `expo-constants`.
- Авторизация: `Token` храним в SecureStore, передаём в `Authorization` header. Обработка 401/403 аналогична вебу (глобальный хэндлер).
- Логи LLM и workout — через те же эндпоинты; следим за лимитами и таймаутами, чтобы возвращать дружелюбные сообщения.

## 6. Сборка и дистрибуция
- **Разработка:** `flutter run` с hot reload на эмуляторах/устройствах.
- **CI:** GitHub Actions → `flutter analyze`, `flutter test`, кеш pub; сборки через `flutter build apk|appbundle|ipa` или Fastlane.
- **Прод релизы:** Play/App Store через стандартные пайплайны. OTA — через версии приложения (без Expo).
- Папки `mobile/android` и `mobile/ios` генерируются `flutter create --platforms android,ios`.

## 7. План работ
1. Настроить Flutter проект, добавить базовые экраны (Auth, Tabs).
2. Вынести shared API/сторы (`packages/shared`) в Dart-пакет или генерируемые клиенты.
3. Реализовать Program Board (лист + модалки + drag&drop).
4. Реализовать Workout Checklist с офлайн-очередью и RestTimer.
5. Добавить Analytics и LLM Assistant.
6. Настроить сборки/CI через Flutter build/Fastlane.
