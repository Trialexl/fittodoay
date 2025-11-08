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
      "rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
      variant === "primary" &&
        "bg-blue-600 text-white hover:bg-blue-500 focus:ring-blue-500",
      variant === "secondary" &&
        "bg-slate-100 text-slate-900 hover:bg-slate-200 focus:ring-slate-400",
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
