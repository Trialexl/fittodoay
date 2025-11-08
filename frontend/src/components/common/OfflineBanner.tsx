"use client";

import { useOffline } from "@/hooks/useOffline";

export const OfflineBanner = () => {
  const isOffline = useOffline();
  if (!isOffline) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-white">
      Нет соединения. Изменения сохранятся после синхронизации.
    </div>
  );
};
