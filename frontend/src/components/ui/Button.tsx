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
        "bg-primary text-white hover:bg-primary-dark focus:ring-primary/50",
      variant === "secondary" &&
        "bg-primary/10 text-primary hover:bg-primary/20 focus:ring-primary/30",
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
