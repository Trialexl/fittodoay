import { AnalyticsPanels } from "@/components/analytics/AnalyticsPanels";

export default function AnalyticsPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-widest text-primary">Аналитика</p>
        <h1 className="text-3xl font-semibold">Прогресс и рекомендации</h1>
        <p className="text-slate-600">
          Следи за нагрузкой по дням и упражнениям, готовь данные для будущих AI-подсказок.
        </p>
      </header>
      <AnalyticsPanels />
    </div>
  );
}
