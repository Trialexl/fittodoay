"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/state/AuthContext";
import { Button } from "@/components/ui/Button";
import { BrandMark } from "@/components/common/BrandMark";

const links = [
  { href: "/programs", label: "Программы" },
  { href: "/workout", label: "Чеклист" },
  { href: "/analytics", label: "Аналитика" },
];

export const AppHeader = () => {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  if (pathname === "/") {
    return null;
  }

  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold text-slate-900">
          <BrandMark />
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-600">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-slate-900">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="text-slate-500">{user.email}</span>
              <Button variant="ghost" onClick={logout}>
                Выйти
              </Button>
            </>
          ) : (
            <div className="flex gap-3">
              <Link href="/login" className="text-primary">
                Войти
              </Link>
              <Link href="/register" className="text-primary">
                Регистрация
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
