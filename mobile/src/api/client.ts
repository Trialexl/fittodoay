import { createApiClient } from "@fittodoay/shared";

import { API_BASE_URL } from "../config";
import { authTokenStorage } from "../storage/authToken";

export const apiFetch = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => authTokenStorage.getToken(),
  onInvalidToken: () => authTokenStorage.clearToken(),
});
