import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AssistantPage from './page';

const mocks = vi.hoisted(() => ({ api: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));
vi.mock('@/state/AuthContext', () => ({ useAuth: () => ({ token: 'qa', user: { id: 1 }, loading: false }) }));
vi.mock('@/state/ThemeContext', () => ({ useTheme: () => ({ designVersion: 'v2' }) }));
vi.mock('@/lib/api', () => ({ apiFetch: mocks.api, ApiError: class ApiError extends Error {} }));
afterEach(cleanup);
const draft = { draft_id: 'draft-id', plan: { programs: [{ name: 'Проверяемый план', days: [{ name: 'Спина', schedule_config: { days_of_week: [0, 3] }, exercises: [{ exercise_id: 'row', exercise_name: 'Тяга гантели', sets: 3, reps: 12, weight: null, rest: 60 }] }] }] } };
beforeEach(() => {
  mocks.api.mockReset().mockImplementation(async (path) => path.includes('/preview/') ? draft : path.includes('/apply/') ? { created_programs: [{ id: 10, name: 'Проверяемый план', templates: 1, is_active: true }] } : {});
});
async function preview() {
  render(<AssistantPage />);
  for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сгенерировать программу' }));
  await screen.findByText('Проверьте программу');
}
it('shows exercises and schedule before saving and confirms the exact draft', async () => {
  await preview();
  expect(screen.getByText('Тяга гантели')).toBeTruthy();
  expect(screen.getByText('Пн, Чт')).toBeTruthy();
  expect(mocks.api.mock.calls.some(([path]) => path.includes('/apply/'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить программу' }));
  await screen.findByText('Программы готовы');
  expect(mocks.api).toHaveBeenCalledWith('/api/llm-agent/programs/drafts/draft-id/apply/', { method: 'POST' });
});
it('keeps the same draft for retry after a failed confirmation', async () => {
  await preview();
  mocks.api.mockRejectedValueOnce(new Error('temporary network failure'));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить программу' }));
  await screen.findByRole('alert');
  expect(screen.getByText('Тяга гантели')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить программу' }));
  await waitFor(() => expect(screen.getByText('Программы готовы')).toBeTruthy());
  expect(mocks.api.mock.calls.filter(([path]) => path.includes('/apply/')).map(([path]) => path)).toEqual(['/api/llm-agent/programs/drafts/draft-id/apply/', '/api/llm-agent/programs/drafts/draft-id/apply/']);
});
