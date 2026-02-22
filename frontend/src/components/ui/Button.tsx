"use client";

import { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
};

export const Button = ({
  className,
  children,
  variant = "primary",
  loading,
  disabled,
  ...rest
}: Props) => (
  <button
    className={clsx(
      "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2",
      variant === "primary" &&
        "bg-primary text-white shadow-sm hover:-translate-y-[1px] hover:bg-primary-dark focus:ring-primary/50",
      variant === "secondary" &&
        "border border-primary/20 bg-primary/10 text-primary hover:-translate-y-[1px] hover:bg-primary/20 focus:ring-primary/30",
      variant === "ghost" && "bg-transparent text-slate-600 hover:bg-slate-100",
      (disabled || loading) && "opacity-60 cursor-not-allowed",
      className,
    )}
    disabled={disabled || loading}
    {...rest}
  >
    {loading ? "..." : children}
  </button>
);
