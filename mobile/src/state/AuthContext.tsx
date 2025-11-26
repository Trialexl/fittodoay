import { createContext, ReactNode, useEffect, useMemo, useState } from "react";

import { profileApi, UserProfile } from "../api/profile";
import { authTokenStorage } from "../storage/authToken";

type AuthContextValue = {
  isReady: boolean;
  token: string | null;
  user: UserProfile | null;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue>({
  isReady: false,
  token: null,
  user: null,
  signIn: async () => {},
  signOut: async () => {},
});

type Props = { children: ReactNode };

export const AuthProvider = ({ children }: Props) => {
  const [isReady, setIsReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const hydrate = async () => {
      const savedToken = await authTokenStorage.getToken();
      setToken(savedToken);
      setIsReady(true);
      if (savedToken) {
        try {
          const profile = await profileApi.getProfile();
          setUser(profile);
        } catch {
          setUser(null);
        }
      }
    };
    hydrate();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isReady,
      token,
      user,
      signIn: async (nextToken: string) => {
        setToken(nextToken);
        await authTokenStorage.setToken(nextToken);
        try {
          const profile = await profileApi.getProfile();
          setUser(profile);
        } catch {
          setUser(null);
        }
      },
      signOut: async () => {
        setToken(null);
        setUser(null);
        await authTokenStorage.clearToken();
      },
    }),
    [isReady, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
