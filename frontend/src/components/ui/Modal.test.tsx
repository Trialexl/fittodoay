import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

afterEach(cleanup);

it('contains keyboard focus, closes with Escape and restores the opener', () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({
    length: 1,
  } as DOMRectList);
  const opener = document.createElement('button');
  opener.textContent = 'Открыть настройки';
  document.body.append(opener);
  opener.focus();
  const onClose = vi.fn();
  const mounted = render(
    <Modal open title="Оформление" onClose={onClose}>
      <button>Сохранить</button>
    </Modal>,
  );
  expect(screen.getByRole('dialog', { name: 'Оформление' })).toBeTruthy();
  const close = screen.getByRole('button', { name: 'Закрыть' });
  const last = screen.getByRole('button', { name: 'Сохранить' });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(last);
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
  mounted.rerender(
    <Modal open={false} title="Оформление" onClose={onClose}>
      <button>Сохранить</button>
    </Modal>,
  );
  expect(document.activeElement).toBe(opener);
  opener.remove();
});
