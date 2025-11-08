import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";
import { OfflineBanner } from "@/components/common/OfflineBanner";
import { AppHeader } from "@/components/common/AppHeader";

export const metadata: Metadata = {
  title: "fitTODOey",
  description: "Персональные тренировки с чеклистами и аналитикой",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="bg-slate-100">
        <AppProviders>
          <OfflineBanner />
          <AppHeader />
          <div className="min-h-screen px-4 pb-10 pt-20 sm:px-6 lg:px-8">{children}</div>
        </AppProviders>
      </body>
    </html>
  );
}
