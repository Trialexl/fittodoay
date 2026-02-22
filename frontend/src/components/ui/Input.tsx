"use client";

import clsx from "clsx";
import { InputHTMLAttributes, forwardRef } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, error, className, ...rest }, ref) => (
    <label className="mb-3 flex flex-col gap-1.5 text-sm">
      {label && <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>}
      <input
        ref={ref}
        className={clsx(
          "form-field",
          error && "border-red-500",
          className,
        )}
        {...rest}
      />
      {error && <span className="text-xs text-red-500">{error}</span>}
    </label>
  ),
);

Input.displayName = "Input";
