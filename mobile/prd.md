# fitTODOay — Mobile PRD (React Native / Expo)

## 1. Цель
- Создать нативное мобильное приложение для iOS и Android, используя Expo (React Native) как общий слой.
- Повторить ключевые сценарии веб-клиента: онбординг, управление программами, чеклист тренировок с офлайн-логированием и таймером, аналитика и LLM-ассистент.
- Разделить переиспользуемую логику (API, стораджи, типы) в shared-модуль для совместного использования web и mobile.

## 2. Архитектура
- **Монорепо:** `frontend/` (Next.js), `mobile/` (Expo), `packages/shared/` (переиспользуемый код). На первом этапе shared можно разместить внутри `mobile/` и вынести позже.
- **Стек mobile:** Expo Router (или React Navigation), React Native Reanimated 3, Gesture Handler, FlashList, react-hook-form (через `@hookform/resolvers`), Zustand для локальных стораджей.
- **Графики:** `victory-native` + `react-native-svg`. Drag&drop/свайпы для ProgramBoard — `react-native-gesture-handler` + кастомные алгоритмы сортировки.
- **Сеть:** запросы через общий `apiFetch`, адаптированный под `fetch` RN и `AsyncStorage` вместо `localStorage`. Токены хранятся через `expo-secure-store` (или MMKV).
- **Офлайн:** очередь логов переносим на `AsyncStorage`, слушаем `NetInfo`. Таймер и чеклист должны работать без сети.

## 3. Сценарии
1. **Auth / Onboarding:** экраны входа и пошагового онбординга (wizard). После регистрации — переход к программам.
2. **Program Board:** список папок/шаблонов с drag&drop reorder, CRUD папок/шаблонов, модальные редакторы упражнений.
3. **Workout Checklist:** отображение плана, отметка сетов, офлайн-сохранение и синхронизация, RestTimer fullscreen с блокировкой жестов, баннер «Нет соединения».
4. **Analytics:** карточки нагрузки, топы упражнений, график «Динамика по программам», блок AI-рекомендаций.
5. **LLM Assistant:** wizard ввода предпочтений, запуск `/api/llm-agent/programs/`, отображение созданных программ (как на web).

## 4. Навигация и UI
- Используем Expo Router (file-based) или React Navigation stack + табы (Основные вкладки: Programs, Workout, Analytics, Assistant, Profile).
- Компоненты оформляем через `StyleSheet`/Tailwind-RN (например, `nativewind`) с упором на адаптивность смартфонов.
- Модальные окна — нативные sheets (Reanimated + Gesture Handler).
- Поддержка тёмной темы через `Appearance` API (roadmap).

## 5. Интеграция с backend
- API полностью совпадает с вебом (`/api/...`). Конфигурация `API_BASE_URL` задаётся через `app.config.ts` (`extra.apiBaseUrl`) и `expo-constants`.
- Авторизация: `Token` храним в SecureStore, передаём в `Authorization` header. Обработка 401/403 аналогична вебу (глобальный хэндлер).
- Логи LLM и workout — через те же эндпоинты; следим за лимитами и таймаутами, чтобы возвращать дружелюбные сообщения.

## 6. Сборка и дистрибуция
- **Разработка:** `npx expo start --dev-client`, запуск на эмуляторах/Expo Go.
- **CI:** GitHub Actions → lint/tests shared, `expo-doctor`, затем `eas build --platform android/ios --profile preview`.
- **Прод релизы:** через EAS Build (`eas build -p android|ios --profile production`) + EAS Submit/TestFlight. OTA-обновления UI — `eas update`.
- Папки `mobile/android` и `mobile/ios` зарезервированы под Bare-ресурсы (создадутся после `expo prebuild` при необходимости).

## 7. План работ
1. Настроить Expo проект, добавить базовые экраны (Auth, Tabs).
2. Вынести shared API/сторы (`packages/shared`).
3. Реализовать Program Board (лист + модалки + drag&drop).
4. Реализовать Workout Checklist с офлайн-очередью и RestTimer.
5. Добавить Analytics и LLM Assistant.
6. Настроить EAS Build/Update и CI.
