import { createContext, ReactNode, useEffect, useMemo, useState } from "react";

import { authTokenStorage } from "../storage/authToken";

type AuthContextValue = {
  isReady: boolean;
  token: string | null;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue>({
  isReady: false,
  token: null,
  signIn: async () => {},
  signOut: async () => {},
});

type Props = { children: ReactNode };

export const AuthProvider = ({ children }: Props) => {
  const [isReady, setIsReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const hydrate = async () => {
      const savedToken = await authTokenStorage.getToken();
      setToken(savedToken);
      setIsReady(true);
    };
    hydrate();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isReady,
      token,
      signIn: async (nextToken: string) => {
        setToken(nextToken);
        await authTokenStorage.setToken(nextToken);
      },
      signOut: async () => {
        setToken(null);
        await authTokenStorage.clearToken();
      },
    }),
    [isReady, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
