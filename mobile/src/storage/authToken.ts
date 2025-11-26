import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "fittodoay_token";

export const authTokenStorage = {
  async getToken() {
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async setToken(token: string) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async clearToken() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};
