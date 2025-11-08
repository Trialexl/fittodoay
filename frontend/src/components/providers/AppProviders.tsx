"use client";

import { AuthProvider } from "@/state/AuthContext";

export const AppProviders = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);
