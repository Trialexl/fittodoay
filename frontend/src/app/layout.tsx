import type { Metadata } from "next";
import dynamic from "next/dynamic";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";

const OfflineBanner = dynamic(() => import("@/components/common/OfflineBanner").then((mod) => mod.OfflineBanner), { ssr: false });
const AppHeader = dynamic(() => import("@/components/common/AppHeader").then((mod) => mod.AppHeader), { ssr: false });
const GlobalMusicPlayer = dynamic(() => import("@/components/common/GlobalMusicPlayer").then((mod) => mod.GlobalMusicPlayer), { ssr: false });

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
