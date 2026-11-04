'use client';

import { useTheme, type DesignVersion } from '@/state/ThemeContext';
import { useAuth } from '@/state/AuthContext';
import { Button } from '@/components/ui/Button';

export function DesignVersionSettings() {
  const { designVersion, setDesignVersion, loading, saving, error, retrySave } =
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
