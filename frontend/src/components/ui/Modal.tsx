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
  mobileSheet?: boolean;
};

export const Modal = ({
  open,
  title,
  description,
  onClose,
  children,
  className,
  footer,
  mobileSheet = false,
}: ModalProps) => {
  if (!open) return null;
  return (
    <div
      className={clsx(
        "fixed inset-0 z-50 bg-slate-900/45",
        mobileSheet ? "flex items-end justify-center px-0 py-0 sm:items-center sm:px-4 sm:py-6" : "flex items-center justify-center px-3 py-4 sm:px-4 sm:py-6",
      )}
      style={{ animation: "modalOverlayIn 160ms ease-out" }}
    >
      <div
        className={clsx(
          "relative flex w-full flex-col overflow-hidden bg-white shadow-2xl",
          mobileSheet
            ? "h-[84vh] rounded-t-[24px] border-t border-slate-200/70 bg-gradient-to-b from-white via-slate-50 to-white p-4 sm:max-h-[92vh] sm:h-auto sm:max-w-3xl sm:rounded-[32px] sm:p-6"
            : "max-h-[92vh] rounded-[28px] p-4 sm:max-w-3xl sm:rounded-[32px] sm:p-6",
          className,
        )}
        style={{ animation: mobileSheet ? "sheetIn 220ms cubic-bezier(0.22, 1, 0.36, 1)" : "modalScaleIn 180ms ease-out" }}
      >
        {mobileSheet && <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />}
        <button
          aria-label="Закрыть"
          className="absolute right-3 top-3 z-10 rounded-full bg-slate-100/90 p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 sm:right-6 sm:top-6 sm:bg-transparent"
          onClick={onClose}
        >
          ×
        </button>
        {title && <h2 className="pr-10 text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h2>}
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        <div className={clsx("mt-4 min-h-0 flex-1 pr-1", mobileSheet ? "overflow-hidden" : "overflow-y-auto")}>
          {children}
        </div>
        {footer && <div className="mt-4 flex flex-wrap justify-end gap-2 sm:mt-6 sm:gap-3">{footer}</div>}
      </div>
      <style jsx global>{`
        @keyframes modalOverlayIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalScaleIn {
          from { opacity: 0; transform: scale(0.98) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes sheetIn {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
