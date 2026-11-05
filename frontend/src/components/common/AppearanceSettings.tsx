'use client';

import { useTheme, type DesignVersion } from '@/state/ThemeContext';
import { useAuth } from '@/state/AuthContext';
import { Button } from '@/components/ui/Button';

export function DesignVersionSettings() {
  const { designVersion, setDesignVersion, muscleSummaryView, setMuscleSummaryView, loading, saving, error, retrySave } =
    useTheme();
  const { user } = useAuth();
  const designs: { value: DesignVersion; name: string; description: string }[] = [
    {
      value: 'v1',
      name: 'Классический',
      description: 'Привычный интерфейс и компактное меню.',
    },
    {
      value: 'v2',
      name: 'Современный',
      description: 'Адаптивные панели, новая навигация и компоненты.',
    },
  ];
  return (
    <fieldset className="design-settings" disabled={loading || saving}>
      <legend>Версия интерфейса</legend>
      <p className="design-settings-description">
        Ваши программы и результаты доступны в обеих версиях.
      </p>
      <div className="design-choice-grid">
        {designs.map((design) => (
          <label
            key={design.value}
            className="design-choice"
            data-selected={designVersion === design.value}
          >
            <input
              type="radio"
              name="design-version"
              value={design.value}
              checked={designVersion === design.value}
              onChange={() => setDesignVersion(design.value)}
            />
            <span
              className={`design-preview design-preview-${design.value}`}
              aria-hidden="true"
            >
              <span className="design-preview-nav" />
              <span className="design-preview-content">
                <span />
                <span />
                <span />
              </span>
            </span>
            <span className="design-choice-title">
              {design.name}
              <span>{design.value.toUpperCase()}</span>
            </span>
            <span className="design-choice-description">{design.description}</span>
          </label>
        ))}
      </div>
      {designVersion === 'v2' && (
        <fieldset className="muscle-view-settings">
          <legend>Группы мышц на тренировке</legend>
          <div className="design-choice-grid">
            <label className="design-choice" data-selected={muscleSummaryView === 'chips'}>
              <input
                type="radio"
                name="muscle-summary-view"
                value="chips"
                checked={muscleSummaryView === 'chips'}
                onChange={() => setMuscleSummaryView('chips')}
              />
              <span className="design-choice-title">Плашки в сводке</span>
              <span className="design-choice-description">Количество упражнений на каждую группу в верхней карточке.</span>
            </label>
            <label className="design-choice" data-selected={muscleSummaryView === 'bars'}>
              <input
                type="radio"
                name="muscle-summary-view"
                value="bars"
                checked={muscleSummaryView === 'bars'}
                onChange={() => setMuscleSummaryView('bars')}
              />
              <span className="design-choice-title">Отдельный виджет</span>
              <span className="design-choice-description">Общее и выполненное количество упражнений со шкалой прогресса.</span>
            </label>
          </div>
        </fieldset>
      )}
      <div aria-live="polite" className="appearance-save-status">
        {loading
          ? 'Загружаем настройки…'
          : saving
            ? 'Сохраняем в профиле…'
            : !error
              ? user
                ? 'Настройки синхронизированы с профилем.'
                : 'Настройки сохраняются на этом устройстве.'
              : null}
      </div>
      {error && (
        <div role="alert" className="appearance-save-error">
          <p>{error}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={retrySave}
            disabled={loading || saving}
          >
            Повторить сохранение
          </Button>
        </div>
      )}
    </fieldset>
  );
}
