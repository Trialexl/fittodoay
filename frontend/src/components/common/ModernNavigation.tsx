'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/state/AuthContext';


const destinations = [
  { href: '/workout', label: 'Тренировка', icon: 'workout' },
  { href: '/programs', label: 'Программы', icon: 'programs' },
  { href: '/analytics', label: 'Аналитика', icon: 'analytics' },
  { href: '/technique-review', label: 'Техника', icon: 'technique' },
  { href: '/assistant', label: 'Помощник', icon: 'assistant' },
] as const;

type IconName =
  | (typeof destinations)[number]['icon']
  | 'settings'
  | 'connect'
  | 'feedback'
  | 'logout';
export function AppIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    workout: (
      <>
        <path d="M6 8v8m12-8v8M3 10v4m18-4v4M6 12h12" />
        <path d="M8 4h8" />
      </>
    ),
    programs: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M9 4v16m0-10h11" />
      </>
    ),
    analytics: (
      <>
        <path d="M4 4v16h16M8 15l4-5 4 2 4-7" />
      </>
    ),
    technique: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m10 9 5 3-5 3V9Z" />
      </>
    ),
    assistant: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" />
        <circle cx="15" cy="17" r="3" />
      </>
    ),
    connect: (
      <>
        <path d="m8 14 6-6M8 7l2-2a5 5 0 0 1 7 7l-2 2M16 17l-2 2a5 5 0 0 1-7-7l2-2" />
      </>
    ),
    feedback: (
      <>
        <path d="M20 11a8 8 0 0 1-8 8H5l-3 2V11a9 9 0 0 1 18 0Z" />
        <path d="M8 10h8m-8 4h5" />
      </>
    ),
    logout: (
      <>
        <path d="M10 4H5v16h5m4-12 4 4-4 4m-4-4h11" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function ModernNavigation({
  onAppearance,
  onFeedback,
  onMcp,
}: {
  onAppearance: () => void;
  onFeedback: () => void;
  onMcp: () => void;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const publicPage = ['/', '/login', '/register', '/onboarding'].includes(pathname);
  const appNavigation = Boolean(user && !publicPage);
  const active = destinations.find((destination) => destination.href === pathname);
  const mobileLabels = { workout: 'Сегодня', programs: 'Планы', analytics: 'Прогресс', technique: 'Техника', assistant: 'Помощник' };
  const brand = <span className="modern-wordmark">fit<strong>TODO</strong>ay<span aria-hidden="true">.</span></span>;
  return (
    <>
      <header className="modern-topbar">
        <Link
          href={user ? '/workout' : '/'}
          className="modern-mobile-brand"
          aria-label="fitTODOay — главная"
        >
          {brand}
        </Link>
        <div className="modern-location">
          <span>Личное пространство</span>
          <strong>{active?.label ?? 'fitTODOay'}</strong>
        </div>
        <div className="modern-topbar-actions">
          {user && (
            <span className="modern-avatar" aria-label={`Аккаунт ${user.email}`}>
              {(user.first_name || user.email).slice(0, 1).toUpperCase()}
            </span>
          )}
          <button
            type="button"
            className="modern-icon-button"
            onClick={onAppearance}
            aria-label="Настройки оформления"
            title="Настройки оформления"
          >
            <AppIcon name="settings" />
          </button>
          {!user && (
            <Link href="/" className="modern-text-link">
              Войти
            </Link>
          )}
        </div>
      </header>
      {appNavigation && (
        <>
          <aside className="modern-sidebar" aria-label="Боковая панель">
            <Link
              href="/workout"
              className="modern-brand"
              aria-label="fitTODOay — тренировка"
            >
              <span className="modern-brand-symbol">
                <AppIcon name="workout" />
              </span>
              {brand}
            </Link>
            <p className="modern-nav-caption">ТВОЙ РИТМ. ТВОЙ ПРОГРЕСС.</p>
            <nav className="modern-desktop-nav" aria-label="Основная навигация">
              {destinations.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={pathname === item.href ? 'page' : undefined}
                  className="modern-nav-link"
                >
                  <AppIcon name={item.icon} />
                  <span>{item.label}</span>
                  {pathname === item.href && <span className="modern-active-dot" />}
                </Link>
              ))}
            </nav>
            <div className="modern-sidebar-footer">
              <button type="button" onClick={onAppearance} className="modern-nav-link">
                <AppIcon name="settings" />
                <span>Оформление</span>
              </button>
              <button type="button" onClick={onMcp} className="modern-nav-link">
                <AppIcon name="connect" />
                <span>Подключить MCP</span>
              </button>
              <button type="button" onClick={onFeedback} className="modern-nav-link">
                <AppIcon name="feedback" />
                <span>Обратная связь</span>
              </button>
              <div className="modern-account">
                <span className="modern-avatar">
                  {(user?.first_name || user?.email || '').slice(0, 1).toUpperCase()}
                </span>
                <span className="modern-account-name">
                  <strong>{user?.first_name || 'Мой аккаунт'}</strong>
                  <span>{user?.email}</span>
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="modern-icon-button"
                  aria-label="Выйти из аккаунта"
                  title="Выйти"
                >
                  <AppIcon name="logout" />
                </button>
              </div>
            </div>
          </aside>
          <nav className="modern-bottom-nav" aria-label="Основная навигация">
            {destinations.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? 'page' : undefined}
              >
                <span>
                  <AppIcon name={item.icon} />
                </span>
                <span>{mobileLabels[item.icon]}</span>
              </Link>
            ))}
          </nav>
          <details className="modern-mobile-more">
            <summary aria-label="Меню аккаунта">Ещё <span aria-hidden="true">⌄</span></summary>
            <div>
              <p>{user?.email}</p>
              <button type="button" onClick={onMcp}>
                Подключить MCP
              </button>
              <button type="button" onClick={onFeedback}>
                Обратная связь
              </button>
              <button type="button" onClick={logout}>
                Выйти
              </button>
            </div>
          </details>
        </>
      )}
    </>
  );
}
