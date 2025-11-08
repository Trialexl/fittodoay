import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'fitTODOey',
  description: 'Персональные тренировки с чеклистами и аналитикой',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
