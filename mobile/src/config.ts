import Constants from "expo-constants";

const fallbackHost = "http://localhost:8000";
const apiHost = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl || fallbackHost;

export const API_BASE_URL = `${apiHost.replace(/\\/$/, "")}/api`;
