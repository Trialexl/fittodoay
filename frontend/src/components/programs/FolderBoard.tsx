"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";
import useSWR from "swr";
import { useState } from "react";

type Folder = {
  id: number;
  name: string;
  comment: string;
  is_active: boolean;
  sort_order: number;
};

const fetcher = (url: string, token: string | null) =>
  apiFetch<Folder[]>(url, { token });

export const FolderBoard = () => {
  const { token } = useAuth();
  const { data, mutate, isLoading } = useSWR(
    token ? ["/api/programs/folders/", token] : null,
    ([url]) => fetcher(url as string, token),
  );
  const [newFolder, setNewFolder] = useState({ name: "", comment: "" });

  const handleCreate = async () => {
    if (!newFolder.name) return;
    await apiFetch("/api/programs/folders/", {
      method: "POST",
      body: JSON.stringify(newFolder),
      token: token ?? undefined,
    });
    setNewFolder({ name: "", comment: "" });
    mutate();
  };

  const toggleActive = async (folder: Folder) => {
    await apiFetch(`/api/programs/folders/${folder.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: !folder.is_active }),
      token: token ?? undefined,
    });
    mutate();
  };

  if (isLoading) return <p>Загрузка...</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="font-semibold">Новая папка</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Input
            label="Название"
            value={newFolder.name}
            onChange={(e) => setNewFolder((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Input
            label="Комментарий"
            value={newFolder.comment}
            onChange={(e) =>
              setNewFolder((prev) => ({ ...prev, comment: e.target.value }))
            }
          />
        </div>
        <Button className="mt-3" onClick={handleCreate}>
          Добавить папку
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {data?.map((folder) => (
          <div key={folder.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">
                  {folder.is_active ? folder.name : `${folder.name} - не активен`}
                </p>
                <p className="text-sm text-slate-500">{folder.comment}</p>
              </div>
              <Button variant="secondary" onClick={() => toggleActive(folder)}>
                {folder.is_active ? "Деактивировать" : "Активировать"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
