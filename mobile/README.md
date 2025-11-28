# fitTODOay Mobile (Flutter 3.x)

Эта ветка переводит мобильное приложение с Expo на Flutter. Основные шаги запуска:

1. Установите Flutter SDK 3.x и Android Studio (SDK 34+) / Xcode для iOS. Проверьте `flutter doctor` до зелёного статуса.
2. В папке `mobile` выполните инициализацию платформ (если не созданы):
   ```bash
   flutter create . --org com.fittodoay --project-name fittodoay_mobile --platforms android,ios
   ```
   Это добавит android/ios/web папки и базовые настройки.
3. Установите зависимости:
   ```bash
   flutter pub get
   ```
4. Запуск:
   ```bash
   flutter run -d emulator-5554   # ваш девайс/эмулятор
   ```
   Горячая перезагрузка доступна через `r` в консоли или в IDE.

## Цели (по PRD)
- Повторить сценарии веба: онбординг/логин, Program Board, Workout чеклист с офлайн-логированием и таймером, аналитика, LLM-ассистент.
- Общий код и типы — вынести в shared-модуль (packages/shared) по мере миграции.

## Структура
- `lib/main.dart` — каркас приложения, табы и базовые экраны.
- `lib/screens/` — заглушки вкладок (Programs/Workout/Analytics/Assistant/Profile).
- `lib/theme.dart` — базовые цвета/отступы в духе фронтенда.

## TODO
- Подключить API клиента к backend (`/api/...`), авторизацию и хранилище токена.
- Перенести Program Board, ассистент и workout-логирование в Flutter.
- Добавить графики (charts), офлайн-очередь и таймеры.
