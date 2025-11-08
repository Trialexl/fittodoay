"use client";

import clsx from "clsx";

type Props = {
  className?: string;
  iconClassName?: string;
};

export const BrandMark = ({ className, iconClassName }: Props) => {
  return (
    <span
      className={clsx(
        "inline-flex flex-col items-center gap-1 text-current",
        className,
      )}
    >
      <span className="text-xs uppercase tracking-[0.4em] text-current">Fit</span>
      <span className="inline-flex items-center gap-[2px] font-semibold leading-none text-current">
        <span className="tracking-tight">TOD</span>
        <span
          aria-hidden
          className={clsx(
            "relative inline-flex h-[0.85em] w-[0.85em] items-center justify-center text-primary",
            iconClassName,
          )}
        >
          <span className="absolute inset-0 rounded-full border-[1.5px] border-current opacity-80"></span>
          <svg
            viewBox="0 0 24 24"
            className="h-[0.7em] w-[0.7em]"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 13 10 17 18 7" />
          </svg>
        </span>
        <span className="uppercase tracking-tight">AY</span>
      </span>
    </span>
  );
};
