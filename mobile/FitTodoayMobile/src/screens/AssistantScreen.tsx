import React from 'react';
import { Screen } from '../components/Screen';
import { Placeholder } from '../components/Placeholder';

export function AssistantScreen() {
  return (
    <Screen>
      <Placeholder
        title="Ассистент"
        description="Визард «Создать с помощником» → POST /api/llm-agent/programs/."
      />
    </Screen>
  );
}
