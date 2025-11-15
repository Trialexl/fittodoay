"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/state/AuthContext";
import { Button } from "@/components/ui/Button";
import { BrandMark } from "@/components/common/BrandMark";

const links = [
  { href: "/programs", label: "Программы" },
  { href: "/workout", label: "Чеклист" },
  { href: "/analytics", label: "Аналитика" },
  { href: "/assistant", label: "Помощник" },
];

export const AppHeader = () => {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const shouldHideHeader = pathname === "/";

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (shouldHideHeader) {
    return null;
  }

  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href={user ? "/workout" : "/"} className="text-lg font-semibold text-slate-900">
          <BrandMark />
        </Link>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-primary hover:text-primary"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
          >
            <span className="h-4 w-4">
              <svg
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinejoin="round"
              >
                <rect x="4" y="4" width="6" height="6" rx="1" />
                <rect x="14" y="4" width="6" height="6" rx="1" />
                <rect x="4" y="14" width="6" height="6" rx="1" />
                <rect x="14" y="14" width="6" height="6" rx="1" />
              </svg>
            </span>
            <span className="text-base">{menuOpen ? "▴" : "▾"}</span>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-3 w-64 rounded-2xl border border-slate-200 bg-white/95 p-4 text-sm shadow-xl">
              <nav className="flex flex-col gap-2 text-slate-700">
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-lg px-2 py-1 transition hover:bg-primary/10 hover:text-primary"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-4 border-t border-slate-100 pt-3 text-slate-600">
                {user && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs uppercase tracking-wide text-slate-400">Аккаунт</span>
                    <span className="text-sm font-medium text-slate-800">{user.email}</span>
                    <Button variant="ghost" className="justify-start px-2" onClick={logout}>
                      Выйти
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
