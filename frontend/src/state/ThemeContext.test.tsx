import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { ThemeProvider, useTheme } from './ThemeContext';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  auth: { token: 'account-one', user: { id: 1 }, loading: false } as {
    token: string | null;
    user: { id: number } | null;
    loading: boolean;
  },
}));
vi.mock('@/lib/api', () => ({ apiFetch: mocks.api }));
vi.mock('@/state/AuthContext', () => ({ useAuth: () => mocks.auth }));

function Harness() {
  const theme = useTheme();
  const [weight, setWeight] = useState('34');
  return (
    <>
      <input
        aria-label="Вес подхода"
        value={weight}
        onChange={(event) => setWeight(event.target.value)}
      />
      <button onClick={() => theme.setDesignVersion('v2')}>V2</button>
      <button onClick={() => theme.setDesignVersion('v1')}>V1</button>
      <button onClick={() => theme.setTheme('dark')}>Dark</button>
      <button onClick={theme.retrySave}>Retry</button>
      <output data-testid="appearance">
        {JSON.stringify({
          version: theme.designVersion,
          theme: theme.theme,
          loading: theme.loading,
          saving: theme.saving,
          error: theme.error,
        })}
      </output>
    </>
  );
}
const view = () => (
  <ThemeProvider>
    <Harness />
  </ThemeProvider>
);
const state = () => JSON.parse(screen.getByTestId('appearance').textContent!);
let profile: Record<string, unknown>;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-design');
  mocks.auth = { token: 'account-one', user: { id: 1 }, loading: false };
  profile = { theme: 'light', accent_color: '#a855f7', design_version: 'v1' };
  mocks.api.mockReset().mockImplementation(async (_path, options) => {
    if (options?.method === 'PUT') profile = { ...profile, ...JSON.parse(options.body) };
    return { ...profile };
  });
});
afterEach(cleanup);

async function ready() {
  render(view());
  await waitFor(() => expect(state().loading).toBe(false));
}

describe('appearance versions', () => {
  it('defaults to V1 and saves both switch directions to the profile', async () => {
    await ready();
    expect(state().version).toBe('v1');
    fireEvent.click(screen.getByText('V2'));
    await waitFor(() => expect(state().saving).toBe(false));
    expect(profile.design_version).toBe('v2');
    expect(document.documentElement.dataset.design).toBe('v2');
    fireEvent.click(screen.getByText('V1'));
    await waitFor(() => expect(state().saving).toBe(false));
    expect(profile.design_version).toBe('v1');
    expect(document.documentElement.dataset.design).toBe('v1');
  });

  it('keeps unfinished set input when switching designs', async () => {
    await ready();
    const input = screen.getByLabelText('Вес подхода') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '36.5' } });
    fireEvent.click(screen.getByText('V2'));
    await waitFor(() => expect(state().saving).toBe(false));
    expect(screen.getByLabelText('Вес подхода')).toBe(input);
    expect(input.value).toBe('36.5');
  });

  it('restores a server selection on a new device and caches it for first paint', async () => {
    profile = { ...profile, theme: 'dark', design_version: 'v2' };
    await ready();
    expect(state().version).toBe('v2');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(JSON.parse(localStorage.getItem('fit-appearance:1')!).designVersion).toBe(
      'v2',
    );
  });

  it('shows a save failure, keeps the local choice and retries it', async () => {
    await ready();
    mocks.api.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByText('V2'));
    await waitFor(() => expect(state().error).toContain('Не удалось сохранить'));
    expect(state().version).toBe('v2');
    expect(profile.design_version).toBe('v1');
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(state().error).toBeNull());
    await waitFor(() => expect(state().saving).toBe(false));
    expect(profile.design_version).toBe('v2');
  });

  it('does not lose an earlier failed choice when another setting saves successfully', async () => {
    await ready();
    let rejectFirst!: (reason: Error) => void;
    mocks.api.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        }),
    );
    fireEvent.click(screen.getByText('V2'));
    await waitFor(() => expect(rejectFirst).toBeTypeOf('function'));
    fireEvent.click(screen.getByText('Dark'));
    await act(async () => {
      rejectFirst(new Error('temporary failure'));
    });
    await waitFor(() => expect(state().saving).toBe(false));
    expect(profile.design_version).toBe('v2');
    expect(profile.theme).toBe('dark');
    expect(state().version).toBe('v2');
    expect(state().error).toBeNull();
  });

  it('isolates guest preferences and does not send anonymous profile writes', async () => {
    mocks.auth = { token: null, user: null, loading: false };
    await ready();
    fireEvent.click(screen.getByText('V2'));
    expect(state().version).toBe('v2');
    expect(mocks.api).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('fit-appearance:guest')!).designVersion).toBe(
      'v2',
    );
    expect(localStorage.getItem('fit-appearance:1')).toBeNull();
  });

  it("ignores the previous account's late save response after logout", async () => {
    const mounted = render(view());
    await waitFor(() => expect(state().loading).toBe(false));
    let complete!: (data: unknown) => void;
    mocks.api.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    fireEvent.click(screen.getByText('V2'));
    await waitFor(() => expect(complete).toBeTypeOf('function'));
    mocks.auth = { token: null, user: null, loading: false };
    mounted.rerender(view());
    await waitFor(() => expect(state().version).toBe('v1'));
    await act(async () => {
      complete({ ...profile, design_version: 'v2' });
    });
    expect(state().version).toBe('v1');
    expect(document.documentElement.dataset.design).toBe('v1');
    expect(JSON.parse(localStorage.getItem('fit-appearance:guest')!).designVersion).toBe(
      'v1',
    );
  });
});

import { DesignVersionSettings } from '@/components/common/AppearanceSettings';

describe('appearance settings controls', () => {
  it('switches through the actual radio controls', async () => {
    render(
      <ThemeProvider>
        <DesignVersionSettings />
        <Harness />
      </ThemeProvider>,
    );
    await waitFor(() => expect(state().loading).toBe(false));
    const modern = screen.getByRole('radio', { name: /Современный/ }) as HTMLInputElement;
    fireEvent.click(modern);
    await waitFor(() => expect(state().saving).toBe(false));
    expect(modern.checked).toBe(true);
    expect(profile.design_version).toBe('v2');
    expect(screen.getByText('Настройки синхронизированы с профилем.')).toBeTruthy();
  });
  it('reports an error and exposes a working retry control', async () => {
    render(
      <ThemeProvider>
        <DesignVersionSettings />
        <Harness />
      </ThemeProvider>,
    );
    await waitFor(() => expect(state().loading).toBe(false));
    mocks.api.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('radio', { name: /Современный/ }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Не удалось сохранить'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Повторить сохранение' }));
    await waitFor(() => expect(state().saving).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(profile.design_version).toBe('v2');
  });
});

describe('muscle summary preference', () => {
  it('defaults to chips, retries failed widget saves and restores the server choice', async () => {
    profile.design_version = 'v2';
    const settings = () => <ThemeProvider><DesignVersionSettings /><Harness /></ThemeProvider>;
    const mounted = render(settings());
    await waitFor(() => expect(state().loading).toBe(false));
    expect((screen.getByRole('radio', { name: /Плашки в сводке/ }) as HTMLInputElement).checked).toBe(true);
    mocks.api.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('radio', { name: /Отдельный виджет/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect((screen.getByRole('radio', { name: /Отдельный виджет/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Повторить сохранение' }));
    await waitFor(() => expect(state().saving).toBe(false));
    expect(profile.muscle_summary_view).toBe('bars');
    mounted.unmount();
    localStorage.clear();
    render(settings());
    await waitFor(() => expect(state().loading).toBe(false));
    expect((screen.getByRole('radio', { name: /Отдельный виджет/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Классический/ }));
    await waitFor(() => expect(state().saving).toBe(false));
    expect(screen.queryByText('Группы мышц на тренировке')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Современный/ }));
    await waitFor(() => expect(state().saving).toBe(false));
    expect((screen.getByRole('radio', { name: /Отдельный виджет/ }) as HTMLInputElement).checked).toBe(true);
  });
});
