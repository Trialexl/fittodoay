# @fittodoay/shared

Набор общих утилит, которые планируется переиспользовать во фронтенде (Next.js) и мобильном Expo-приложении.

## Структура
- `src/api.ts` — изоморфный клиент для REST API. Позволяет настроить базовый URL, способ чтения токена и обработчик невалидных токенов.

## Использование
```ts
import { createApiClient } from "@fittodoay/shared";

const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,
  getToken: () => (typeof window !== "undefined" ? localStorage.getItem("token") : null),
  onInvalidToken: () => logout(),
});

const profile = await api("/api/profile/preferences/");
```

В React Native можно передать `getToken`, который читает `SecureStore/AsyncStorage`, и собственный `fetchImpl`, если требуется кастомное окружение.

## Сборка
```bash
cd packages/shared
npm install
npm run build
```
Файлы окажутся в `dist/`.
