import React from 'react';
import { Screen } from '../components/Screen';
import { Placeholder } from '../components/Placeholder';

export function ProgramsScreen() {
  return (
    <Screen>
      <Placeholder
        title="Программы"
        description="Список папок, шаблоны с расписаниями и интеграция с ассистентом."
      />
    </Screen>
  );
}
