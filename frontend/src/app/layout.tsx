import type { Metadata } from 'next';
import Script from 'next/script';
import { AppFrame } from '@/components/providers/AppFrame';
import './globals.css';
import './design-v2.css';
import { AppProviders } from '@/components/providers/AppProviders';
import { ClientChrome } from '@/components/providers/ClientChrome';

export const metadata: Metadata = {
  title: 'fitTODOay',
  description: 'Персональные тренировки с чеклистами и аналитикой',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning data-theme="light" data-design="v1">
      <body className="antialiased">
        <Script id="appearance-bootstrap" strategy="beforeInteractive">{`
          try {
            var user = JSON.parse(localStorage.getItem('user') || 'null');
            var key = 'fit-appearance:' + (localStorage.getItem('token') && user ? user.id : 'guest');
            var saved = JSON.parse(localStorage.getItem(key) || 'null');
            if (saved) {
              document.documentElement.dataset.design = saved.designVersion === 'v2' ? 'v2' : 'v1';
              document.documentElement.dataset.theme = saved.theme === 'dark' ? 'dark' : 'light';
              if (/^#[0-9a-fA-F]{6}$/.test(saved.accentColor || '')) {
                document.documentElement.style.setProperty('--color-primary', [1,3,5].map(function(i) { return parseInt(saved.accentColor.slice(i,i+2),16); }).join(' '));
              }
            }
          } catch (e) {}
        `}</Script>
        <AppProviders>
          <AppFrame>
            <ClientChrome position="before" />
            <div
              id="main-content"
              tabIndex={-1}
              className="app-content min-h-screen px-4 pb-24 pt-20 sm:px-6 lg:px-8"
            >
              {children}
            </div>
            <ClientChrome position="after" />
          </AppFrame>
        </AppProviders>
      </body>
    </html>
  );
}
