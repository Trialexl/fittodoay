"use client";

import clsx from "clsx";
import { ReactNode, useEffect, useId, useRef } from "react";

type ModalProps = {
  open: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  className?: string;
  overlayClassName?: string;
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
  overlayClassName,
  footer,
  mobileSheet = false,
}: ModalProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    )).filter((element) => element.getClientRects().length > 0);
    (focusable()[0] ?? panel).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[data-ui-dialog="true"]');
      if (dialogs[dialogs.length - 1] !== panel) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) { event.preventDefault(); panel.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      className={clsx(
        "ui-dialog-overlay fixed inset-0 z-50 bg-slate-900/45 dark:bg-black/70",
        mobileSheet ? "flex items-end justify-center px-0 py-0 sm:items-center sm:px-4 sm:py-6" : "flex items-center justify-center px-3 py-4 sm:px-4 sm:py-6",
        overlayClassName,
      )}
      style={{ animation: "modalOverlayIn 160ms ease-out" }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "Диалог"}
        aria-describedby={description ? descriptionId : undefined}
        data-ui-dialog="true"
        tabIndex={-1}
        className={clsx(
          "ui-dialog-panel relative flex w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900",
          mobileSheet
            ? "h-[84vh] rounded-t-[24px] border-t border-slate-200/70 bg-gradient-to-b from-white via-slate-50 to-white p-4 dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 sm:max-h-[92vh] sm:h-auto sm:max-w-3xl sm:rounded-[32px] sm:p-6"
            : "max-h-[92vh] rounded-[28px] p-4 sm:max-w-3xl sm:rounded-[32px] sm:p-6",
          className,
        )}
        style={{ animation: mobileSheet ? "sheetIn 220ms cubic-bezier(0.22, 1, 0.36, 1)" : "modalScaleIn 180ms ease-out" }}
      >
        {mobileSheet && <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700 sm:hidden" />}
        <button
          aria-label="Закрыть"
          className="absolute right-3 top-3 z-10 rounded-full bg-slate-100/90 p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 sm:right-6 sm:top-6 sm:bg-transparent"
          onClick={onClose}
        >
          ×
        </button>
        {title && <h2 id={titleId} className="pr-10 text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl">{title}</h2>}
        {description && <p id={descriptionId} className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
        <div
          className={clsx(
            "mt-4 min-h-0 flex-1 pr-1",
            mobileSheet ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "overflow-y-auto",
          )}
        >
          {children}
        </div>
        {footer && <div className="mt-4 flex flex-wrap justify-end gap-2 sm:mt-6 sm:gap-3">{footer}</div>}
      </div>

    </div>
  );
};
