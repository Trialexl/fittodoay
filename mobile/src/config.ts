import Constants from "expo-constants";

const fallbackBaseUrl = "http://localhost:8000";

export const API_BASE_URL =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ||
  fallbackBaseUrl;
