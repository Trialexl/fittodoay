"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/state/AuthContext";
import { useTheme } from "@/state/ThemeContext";
import { Button } from "@/components/ui/Button";
import { BrandMark } from "@/components/common/BrandMark";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";

const links = [
  { href: "/programs", label: "Программы" },
  { href: "/workout", label: "Чеклист" },
  { href: "/analytics", label: "Аналитика" },
  { href: "/assistant", label: "Помощник" },
];

const accentOptions = [
  { value: "#a855f7", label: "Фиолетовый" },
  { value: "#0ea5e9", label: "Голубой" },
  { value: "#22c55e", label: "Зелёный" },
  { value: "#f59e0b", label: "Янтарный" },
  { value: "#ef4444", label: "Красный" },
];

const MenuIcon = ({ name }: { name: "programs" | "workout" | "analytics" | "assistant" | "appearance" }) => {
  if (name === "programs") {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path d="M2.5 6.5h5l1.2 1.5H17a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1Z" />
      </svg>
    );
  }
  if (name === "workout") {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path d="M4 10.5 8.2 14.5 16 6.5" />
      </svg>
    );
  }
  if (name === "analytics") {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path d="M3 15.5h14M5 13l3-3 2 2 5-6" />
      </svg>
    );
  }
  if (name === "assistant") {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <rect x="4" y="6" width="12" height="10" rx="2" />
        <path d="M10 3.5v2M7.5 10h.01M12.5 10h.01M7.5 13h5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path d="M10 3.5a6.5 6.5 0 1 0 0 13h1a1.5 1.5 0 1 0 0-3h-1.2a1.8 1.8 0 1 1 0-3.6h.7A2.5 2.5 0 1 0 10 3.5Z" />
      <circle cx="6.6" cy="8" r=".7" fill="currentColor" stroke="none" />
      <circle cx="9.2" cy="6.8" r=".7" fill="currentColor" stroke="none" />
      <circle cx="12.1" cy="7.2" r=".7" fill="currentColor" stroke="none" />
    </svg>
  );
};

export const AppHeader = () => {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, setTheme, accentColor, setAccentColor, saving: savingTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<"main" | "appearance">("main");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [sendingFeedback, setSendingFeedback] = useState(false);
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
    setMenuView("main");
  }, [pathname]);

  if (shouldHideHeader) {
    return null;
  }

  const openFeedback = () => {
    setFeedbackError(null);
    setFeedbackSent(false);
    setFeedbackOpen(true);
    setMenuOpen(false);
  };

  const submitFeedback = async () => {
    const trimmed = feedbackMessage.trim();
    if (!trimmed) {
      setFeedbackError("Напишите пару слов, что можно улучшить");
      return;
    }
    setSendingFeedback(true);
    setFeedbackError(null);
    try {
      await apiFetch("/api/feedback/", {
        method: "POST",
        body: JSON.stringify({ message: trimmed }),
      });
      setFeedbackSent(true);
      setFeedbackMessage("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Не удалось отправить отзыв";
      setFeedbackError(message);
    } finally {
      setSendingFeedback(false);
    }
  };

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href={user ? "/workout" : "/"} className="text-lg font-semibold text-slate-900">
            <BrandMark />
          </Link>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-surface px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-primary hover:text-primary"
              onClick={() =>
                setMenuOpen((prev) => {
                  const next = !prev;
                  if (next) setMenuView("main");
                  return next;
                })
              }
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
              <div
                className="absolute right-0 top-full mt-3 w-[22rem] rounded-2xl border border-border bg-surface/95 p-4 text-sm shadow-xl"
                onClick={(event) => event.stopPropagation()}
              >
                {menuView === "main" ? (
                  <>
                    <nav className="flex flex-col gap-2 text-slate-700">
                      {links.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-primary/10 hover:text-primary"
                        >
                          <MenuIcon
                            name={
                              link.href === "/programs"
                                ? "programs"
                                : link.href === "/workout"
                                  ? "workout"
                                  : link.href === "/analytics"
                                    ? "analytics"
                                    : "assistant"
                            }
                          />
                          <span>{link.label}</span>
                        </Link>
                      ))}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setMenuView("appearance");
                        }}
                        className="flex items-center gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-primary/10 hover:text-primary"
                      >
                        <MenuIcon name="appearance" />
                        <span>Оформление</span>
                      </button>
                    </nav>
                  </>
                ) : (
                  <div className="flex flex-col gap-3 text-slate-600">
                    <button
                      type="button"
                      onClick={() => setMenuView("main")}
                      className="inline-flex items-center gap-2 self-start rounded-lg px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      Назад
                    </button>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs uppercase tracking-wide text-slate-400">Тема</span>
                      <div className="flex rounded-full border border-slate-200 bg-slate-50 p-1">
                        <button
                          type="button"
                          onClick={() => setTheme("light")}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                            theme === "light"
                              ? "bg-primary/10 text-primary"
                              : "text-slate-600 hover:text-primary"
                          }`}
                        >
                          Светлая
                        </button>
                        <button
                          type="button"
                          onClick={() => setTheme("dark")}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                            theme === "dark"
                              ? "bg-primary/10 text-primary"
                              : "text-slate-600 hover:text-primary"
                          }`}
                        >
                          Тёмная
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase tracking-wide text-slate-400">
                          Акцентный цвет
                        </span>
                        {savingTheme && <span className="text-[11px] text-slate-500">Сохраняем…</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {accentOptions.map((option) => {
                          const isActive = option.value.toLowerCase() === accentColor.toLowerCase();
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-label={option.label}
                              title={option.label}
                              onClick={() => setAccentColor(option.value)}
                              className={`flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 shadow-sm transition ${
                                isActive ? "ring-2 ring-offset-2 ring-primary" : "hover:scale-105"
                              }`}
                              style={{ backgroundColor: option.value }}
                            >
                              {isActive && <span className="text-xs text-white">✓</span>}
                            </button>
                          );
                        })}
                        <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 shadow-sm">
                          <span className="text-slate-500">#</span>
                          <input
                            type="color"
                            value={accentColor}
                            onChange={(event) => setAccentColor(event.target.value)}
                            className="h-7 w-12 cursor-pointer border-none bg-transparent p-0"
                            aria-label="Своя палитра"
                          />
                          <span className="text-[11px] text-slate-500">свой</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3 text-slate-600">
                  <Button variant="secondary" className="w-full justify-center" onClick={openFeedback}>
                    Чего не хватает?
                  </Button>
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

      <Modal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        title="Чего не хватает или что хотелось бы изменить?"
        description="Оставьте пожелание — это поможет нам улучшить сервис."
        className="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFeedbackOpen(false)} disabled={sendingFeedback}>
              Отмена
            </Button>
            <Button onClick={submitFeedback} loading={sendingFeedback}>
              Отправить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <textarea
            value={feedbackMessage}
            onChange={(event) => setFeedbackMessage(event.target.value)}
            className="form-textarea min-h-[160px] text-sm"
            placeholder="Опишите, чего вам не хватает или что можно сделать удобнее"
          />
          <p className="text-sm text-slate-500">
            Мы читаем все сообщения. Если нужна обратная связь, оставьте контакты внутри текста.
          </p>
          {feedbackError && <p className="text-sm text-red-500">{feedbackError}</p>}
          {feedbackSent && !feedbackError && (
            <p className="text-sm text-emerald-600">Спасибо! Мы получили ваше пожелание.</p>
          )}
        </div>
      </Modal>
    </>
  );
};
