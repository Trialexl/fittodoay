import React from 'react';
import { Screen } from '../components/Screen';
import { Placeholder } from '../components/Placeholder';

export function WorkoutScreen() {
  return (
    <Screen>
      <Placeholder
        title="Чеклист"
        description="Дневной план, отметка подходов, Rest Timer и офлайн-очередь."
      />
    </Screen>
  );
}
