import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";
import { ClientChrome } from "@/components/providers/ClientChrome";

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
          <ClientChrome position="before" />
          <div className="min-h-screen px-4 pb-24 pt-20 sm:px-6 lg:px-8">{children}</div>
          <ClientChrome position="after" />
        </AppProviders>
      </body>
    </html>
  );
}
