import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProgramNavigator } from './ProgramNavigator';

afterEach(cleanup);
it('selects an inactive program for editing without activating it', () => {
  const create = vi.fn();
  function Harness() {
    const [id, setId] = useState(1);
    return (
      <ProgramNavigator
        folders={[
          { id: 1, name: 'Основные', is_active: true },
          {
            id: 2,
            name: 'Восстановление и мобильность после силовой тренировки',
            is_active: false,
          },
        ]}
        selectedId={id}
        onSelect={setId}
        onCreate={create}
      />
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: /Восстановление/ }));
  expect(screen.getByRole('button', { current: true }).textContent).toContain(
    'Отключена',
  );
  fireEvent.click(screen.getByRole('button', { name: /Новая программа/ }));
  expect(create).toHaveBeenCalledOnce();
});
