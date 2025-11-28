import React from 'react';
import { Screen } from '../components/Screen';
import { Placeholder } from '../components/Placeholder';

export function AnalyticsScreen() {
  return (
    <Screen>
      <Placeholder
        title="Аналитика"
        description="Карточки нагрузки, топ упражнений, график динамики по программам."
      />
    </Screen>
  );
}
