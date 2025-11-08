"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiFetch } from "@/lib/api";

type User = {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    payload: Record<string, unknown>,
  ) => Promise<{ token: string; user: User }>;
  logout: () => void;
  setUser: (user: User | null) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedToken = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (storedToken) {
      setToken(storedToken);
    }
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem("user");
      }
    }
    setLoading(false);
  }, []);

  const persist = useCallback((nextToken: string, nextUser: User) => {
    if (typeof window === "undefined") return;
    localStorage.setItem("token", nextToken);
    localStorage.setItem("user", JSON.stringify(nextUser));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiFetch<{ token: string; user: User }>(
        "/api/auth/login/",
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        },
      );
      setToken(data.token);
      setUser(data.user);
      persist(data.token, data.user);
    },
    [persist],
  );

  const register = useCallback(
    async (payload: Record<string, unknown>) => {
      const data = await apiFetch<{ token: string; user: User }>(
        "/api/auth/register/",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      setToken(data.token);
      setUser(data.user);
      persist(data.token, data.user);
      return data;
    },
    [persist],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    }
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, logout, setUser, register }),
    [user, token, loading, login, logout, register],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
