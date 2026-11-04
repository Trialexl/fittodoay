'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/state/AuthContext';

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const publicPage = ['/', '/login', '/register', '/onboarding'].includes(pathname);
  return (
    <div
      className="app-frame"
      data-navigation={user && !publicPage ? 'app' : 'public'}
      data-page={pathname}
    >
      <a className="skip-link" href="#main-content">
        Перейти к содержимому
      </a>
      {children}
    </div>
  );
}
