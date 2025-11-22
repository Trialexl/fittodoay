# fitTODOay Mobile (Android setup)

1. Установите зависимости:
   ```bash
   cd mobile
   npm install
   ```
2. Запустите Metro/Expo dev server:
   ```bash
   npm run start
   ```
3. Для android-эмулятора или подключённого устройства:
   ```bash
   npm run android
   ```
   Требуется установленный Android Studio (SDK 34+) и запущенный эмулятор либо включённый режим разработчика на устройстве.
4. Собрать release-билд можно через EAS:
   ```bash
   npx eas-cli build -p android --profile preview
   ```
   Перед запуском выполните `npx eas-cli login` и настройте `eas.json`.

Конфигурация приложения задаётся в `mobile/app.json` (пакет `com.fittodoay.app`). Переменная `apiBaseUrl` пока указывает на `http://localhost:8000` — обновите её при подключении к реальному backend окружению.
