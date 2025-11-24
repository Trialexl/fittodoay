"use client";

import { AuthProvider } from "@/state/AuthContext";
import { ThemeProvider } from "@/state/ThemeContext";

export const AppProviders = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>
    <ThemeProvider>{children}</ThemeProvider>
  </AuthProvider>
);
