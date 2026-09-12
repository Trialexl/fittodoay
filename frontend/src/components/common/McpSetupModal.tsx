"use client";

import { useMemo, useState } from "react";

import { resolveApiUrl } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

type McpSetupModalProps = {
  open: boolean;
  onClose: () => void;
};

type CopyStatus = "idle" | "copied" | "failed";

export const McpSetupModal = ({ open, onClose }: McpSetupModalProps) => {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const mcpUrl = useMemo(() => {
    const resolved = resolveApiUrl("/mcp");
    if (typeof window === "undefined") return resolved;
    return new URL(resolved, window.location.origin).toString();
  }, []);

  const close = () => {
    setCopyStatus("idle");
    onClose();
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Подключение Fittoday по MCP"
      description="После подключения ИИ-помощник сможет работать с вашими тренировками только от вашего имени и с подтверждёнными правами."
      className="max-w-2xl"
      footer={
        <Button variant="secondary" onClick={close}>
          Готово
        </Button>
      }
    >
      <div className="flex flex-col gap-5 text-sm text-slate-600 dark:text-slate-300">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Адрес MCP-сервера
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 break-all rounded-xl border border-slate-200 bg-surface px-3 py-2.5 text-sm text-slate-800">
              {mcpUrl}
            </code>
            <Button type="button" variant="secondary" onClick={copyUrl}>
              {copyStatus === "copied" ? "Скопировано" : "Скопировать"}
            </Button>
          </div>
          {copyStatus === "failed" && (
            <p className="mt-2 text-xs text-amber-600">
              Не удалось скопировать автоматически. Выделите адрес и скопируйте его вручную.
            </p>
          )}
        </div>

        <ol className="space-y-3">
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              1
            </span>
            <p className="pt-1">
              Откройте в приложении ChatGPT/Codex раздел <strong className="text-slate-800 dark:text-slate-100">Settings → MCP servers</strong> и нажмите <strong className="text-slate-800 dark:text-slate-100">Add server</strong>.
            </p>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              2
            </span>
            <p className="pt-1">
              Укажите имя <strong className="text-slate-800 dark:text-slate-100">Fittoday</strong>, выберите тип <strong className="text-slate-800 dark:text-slate-100">Streamable HTTP</strong> и вставьте адрес выше.
            </p>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              3
            </span>
            <p className="pt-1">
              Сохраните сервер, нажмите <strong className="text-slate-800 dark:text-slate-100">Restart</strong>, затем <strong className="text-slate-800 dark:text-slate-100">Authenticate</strong>.
            </p>
          </li>
          <li className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              4
            </span>
            <p className="pt-1">
              Войдите в Fittoday в открывшемся окне, проверьте запрошенные права и подтвердите подключение.
            </p>
          </li>
        </ol>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="font-medium text-slate-800 dark:text-slate-100">Это безопасное подключение через OAuth</p>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-300">
            Не вставляйте пароль, API-токен или другие секреты в настройки MCP. Авторизация откроется автоматически после нажатия Authenticate.
          </p>
        </div>

        <a
          href="https://developers.openai.com/codex/mcp"
          target="_blank"
          rel="noreferrer"
          className="w-fit font-medium text-primary underline-offset-4 hover:underline"
        >
          Официальная инструкция по MCP ↗
        </a>
      </div>
    </Modal>
  );
};
