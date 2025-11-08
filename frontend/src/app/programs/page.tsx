import { FolderBoard } from "@/components/programs/FolderBoard";
import { TemplateEditor } from "@/components/templates/TemplateEditor";

export default function ProgramsPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-widest text-primary">
          Программы и шаблоны
        </p>
        <h1 className="text-3xl font-semibold">Управление папками и днями</h1>
        <p className="text-slate-600">
          Активируйте папки, создавайте шаблоны, добавляйте упражнения из каталога
          или собственные варианты.
        </p>
      </header>
      <FolderBoard />
      <TemplateEditor />
    </div>
  );
}
