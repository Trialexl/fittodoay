"use client";

import clsx from "clsx";
import { ReactNode } from "react";

type ModalProps = {
  open: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export const Modal = ({
  open,
  title,
  description,
  onClose,
  children,
  className,
  footer,
}: ModalProps) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
      <div
        className={clsx(
          "relative w-full max-w-3xl rounded-[32px] bg-white p-6 shadow-2xl",
          className,
        )}
      >
        <button
          aria-label="Закрыть"
          className="absolute right-6 top-6 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          onClick={onClose}
        >
          ×
        </button>
        {title && <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>}
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        <div className="mt-4 max-h-[70vh] overflow-y-auto pr-1">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
};
