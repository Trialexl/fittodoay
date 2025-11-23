# fitTODOay Mobile (Android setup)

- Подготовьте Android окружение:
  1. Установите Android Studio (SDK 34+), включите Android SDK Platform-Tools и эмулятор (AVD Manager). На реальном устройстве включите Developer mode и USB debugging.
  2. Установите Expo CLI: `npm install -g expo` (опционально, локально хватает `npx expo`).
  3. В терминале проверьте переменные окружения: `ANDROID_HOME` и `PATH` должны содержать `platform-tools` (для подключённых устройств).
  4. Запустите эмулятор через Android Studio (AVD Manager → Run) либо подключите устройство по USB/Wi-Fi.
  5. **macOS:** установите `watchman` через Homebrew (`brew install watchman`), а также обновите `~/.zprofile` или `~/.zshrc`, чтобы добавить:
     ```bash
     export ANDROID_HOME=$HOME/Library/Android/sdk
     export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
     ```
     После этого перезапустите терминал или выполните `source ~/.zprofile`.

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
