"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProgramBoard } from "@/components/programs/ProgramBoard";
import { useAuth } from "@/state/AuthContext";

const ProgramsPageContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const parseId = (value: string | null) => (value ? Number(value) : undefined);
  const folderId = parseId(searchParams.get("folder"));
  const templateId = parseId(searchParams.get("template"));
  const templateName = searchParams.get("templateName") ?? undefined;
  const exerciseId = parseId(searchParams.get("exercise"));
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-widest text-primary">Программы и шаблоны</p>
        <h1 className="text-3xl font-semibold">Управление папками и днями</h1>
        <p className="text-slate-600">
          Активируйте папки, создавайте шаблоны, добавляйте упражнения из каталога
          или собственные варианты.
        </p>
      </header>
      <ProgramBoard
        initialFocus={{
          folderId: Number.isFinite(folderId) ? folderId : undefined,
          templateId: Number.isFinite(templateId) ? templateId : undefined,
          templateName,
          exerciseId: Number.isFinite(exerciseId) ? exerciseId : undefined,
        }}
      />
    </div>
  );
};

export default function ProgramsPage() {
  return (
    <Suspense fallback={null}>
      <ProgramsPageContent />
    </Suspense>
  );
}
