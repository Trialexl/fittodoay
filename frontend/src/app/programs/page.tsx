"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProgramBoard } from "@/components/programs/ProgramBoard";
import { useAuth } from "@/state/AuthContext";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function ProgramsPage({ searchParams }: PageProps) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const folderId = searchParams?.folder ? Number(searchParams.folder) : undefined;
  const templateId = searchParams?.template ? Number(searchParams.template) : undefined;
  const templateName =
    typeof searchParams?.templateName === "string" ? (searchParams.templateName as string) : undefined;
  const exerciseId = searchParams?.exercise ? Number(searchParams.exercise) : undefined;
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
}
