import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";
import { OfflineBanner } from "@/components/common/OfflineBanner";
import { AppHeader } from "@/components/common/AppHeader";
import { GlobalMusicPlayer } from "@/components/common/GlobalMusicPlayer";

export const metadata: Metadata = {
  title: "fitTODOay",
  description: "Персональные тренировки с чеклистами и аналитикой",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning data-theme="light">
      <body className="antialiased">
        <AppProviders>
          <OfflineBanner />
          <AppHeader />
          <div className="min-h-screen px-4 pb-24 pt-20 sm:px-6 lg:px-8">{children}</div>
          <GlobalMusicPlayer />
        </AppProviders>
      </body>
    </html>
  );
}
