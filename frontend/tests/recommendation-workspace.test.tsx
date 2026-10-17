import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SuggestPage from '@/app/dashboard/suggest/page';
import type { RecommendationRequest, RecommendationTask } from '@/lib/recommendations/types';
import { queryKeys } from '@/lib/hooks/query-keys';

const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const account = vi.hoisted(() => ({ id: 'user-a' }));
const base = vi.hoisted(() => ({ id: 'base-1', type: 'shirt', name: 'White shirt' }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: account.id }, accessToken: 'token' }, status: 'authenticated' }) }));
vi.mock('@/lib/api', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/api')>(), api: transport }));
vi.mock('@/lib/hooks/use-weather', () => ({ useWeather: () => ({ data: undefined, isLoading: false }) }));
vi.mock('@/lib/hooks/use-preferences', () => ({ usePreferences: () => ({ data: { default_occasion: 'casual' } }) }));
vi.mock('@/lib/hooks/use-items', () => ({ useItem: (id: string) => ({ data: id === base.id ? base : undefined }) }));
vi.mock('@/components/recommendations/base-item-picker', () => ({
  BaseItemPicker: ({ onChange }: { onChange: (item: typeof base) => void }) => <button onClick={() => onChange(base)}>Choose base item</button>,
}));

function task(overrides: Partial<RecommendationTask> = {}): RecommendationTask {
  return {
    id: 'task-1', kind: 'recommendation', status: 'queued', stage: 'queued', attempts: 0, max_attempts: 3,
    created_at: '2026-10-17T10:00:00Z', updated_at: '2026-10-17T10:00:00Z', request: { occasion: 'casual', count: 3 },
    result: null, error: null, error_code: null, ...overrides,
  };
}
let activeClient: QueryClient;
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  activeClient = client;
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  account.id = 'user-a';
  transport.get.mockResolvedValue({ tasks: [] });
  transport.post.mockResolvedValue(undefined);
});

describe('recommendation page task flow', () => {
  it('sends single-look, base-item and weather selections to the durable API and renders the result', async () => {
    let created: RecommendationTask | undefined;
    transport.get.mockImplementation(async (path: string) => {
      if (path === '/tasks') return { tasks: created ? [created] : [] };
      if (path === '/tasks/task-1') return created;
      if (path === '/outfits/look-1') return { id: 'look-1', occasion: 'casual', reasoning: 'A fresh everyday look', items: [] };
    });
    transport.post.mockImplementation(async (path: string, request: RecommendationRequest) => {
      if (path === '/tasks/recommendations') {
        created = task({ status: 'succeeded', stage: 'completed', request, result: { outfit_ids: ['look-1'] } });
        return created;
      }
    });
    render(<SuggestPage />, { wrapper: wrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'lookCount.single' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose base item' }));
    fireEvent.click(screen.getByRole('button', { name: 'weatherOverride.overrideWeather' }));
    fireEvent.click(await screen.findByRole('button', { name: 'clear' }));
    const temperature = screen.getByRole('slider', { name: 'weatherOverride.temperature' });
    for (let step = 0; step < 6; step += 1) fireEvent.keyDown(temperature, { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'getSuggestion' }));
    await screen.findByText('A fresh everyday look');
    expect(transport.post).toHaveBeenCalledWith('/tasks/recommendations', expect.objectContaining({
      occasion: 'casual', count: 1, include_items: ['base-1'],
      weather_override: expect.objectContaining({ temperature: 26, condition: 'sunny' }),
    }), expect.objectContaining({ headers: { 'Idempotency-Key': expect.any(String) } }));
    activeClient.setQueryData(queryKeys.pendingOutfits.list(3), { outfits: [{ id: 'look-1' }] });
    fireEvent.click(screen.getByRole('button', { name: 'loveIt' }));
    await waitFor(() => expect(transport.post).toHaveBeenCalledWith('/outfits/look-1/accept'));
    await waitFor(() => expect(activeClient.getQueryState(queryKeys.pendingOutfits.list(3))?.isInvalidated).toBe(true));
  });

  it('submits three looks by default, compares them and skips unchosen alternatives after acceptance', async () => {
    let created: RecommendationTask | undefined;
    transport.get.mockImplementation(async (path: string) => {
      if (path === '/tasks') return { tasks: created ? [created] : [] };
      if (path === '/tasks/task-1') return created;
      if (path.startsWith('/outfits/')) return { id: path.split('/').at(-1), occasion: 'casual', reasoning: `Look ${path.split('/').at(-1)}`, items: [] };
    });
    transport.post.mockImplementation(async (path: string, request: RecommendationRequest) => {
      if (path === '/tasks/recommendations') {
        created = task({ status: 'succeeded', stage: 'completed', request, result: { outfit_ids: ['look-1', 'look-2', 'look-3'] } });
        return created;
      }
    });
    render(<SuggestPage />, { wrapper: wrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'getSuggestion' }));
    await screen.findByText('Look look-1');
    expect(transport.post.mock.calls[0][1].count).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: 'options.allOptions' }));
    expect(screen.getByText('Look look-2')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'options.chooseThis' })[1]);
    await waitFor(() => expect(transport.post).toHaveBeenCalledWith('/outfits/look-2/accept'));
    await waitFor(() => expect(transport.post).toHaveBeenCalledWith('/outfits/look-1/skip'));
    expect(transport.post).toHaveBeenCalledWith('/outfits/look-3/skip');
    expect(transport.post).not.toHaveBeenCalledWith('/outfits/look-2/skip');
  });

  it('serializes slow alternative cleanup so repeated generation clicks cannot create duplicate tasks', async () => {
    let created: RecommendationTask | undefined;
    let releaseSkips!: () => void;
    const skips = new Promise<void>((resolve) => { releaseSkips = resolve; });
    let submissions = 0;
    transport.get.mockImplementation(async (path: string) => {
      if (path === '/tasks') return { tasks: created ? [created] : [] };
      if (path.startsWith('/tasks/')) return created;
      if (path.startsWith('/outfits/')) return { id: path.split('/').at(-1), occasion: 'casual', reasoning: 'A saved look', items: [] };
    });
    transport.post.mockImplementation(async (path: string, request: RecommendationRequest) => {
      if (path === '/tasks/recommendations') {
        submissions += 1;
        created = task({ id: `task-${submissions}`, status: 'succeeded', stage: 'completed', request, result: { outfit_ids: ['look-1', 'look-2', 'look-3'] } });
        return created;
      }
      if (path.endsWith('/skip')) return skips;
    });
    render(<SuggestPage />, { wrapper: wrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'getSuggestion' }));
    await screen.findByText('A saved look');
    const another = screen.getByRole('button', { name: 'options.generateNew' });
    fireEvent.click(another);
    expect(another).toBeDisabled();
    expect(screen.getByRole('button', { name: 'startOver' })).toBeDisabled();
    fireEvent.click(another);
    releaseSkips();
    await waitFor(() => expect(submissions).toBe(2));
    await waitFor(() => expect(screen.getByText('A saved look')).toBeInTheDocument());
    expect(transport.post.mock.calls.filter(([path]) => path === '/tasks/recommendations')).toHaveLength(2);
  });

  it('restores pending server work on page reload and exposes cancellation without a new generation', async () => {
    let current = task({ status: 'running', stage: 'generating' });
    transport.get.mockImplementation(async (path: string) => path === '/tasks' ? { tasks: [current] } : current);
    transport.post.mockImplementation(async (path: string) => {
      if (path === '/tasks/task-1/cancel') { current = task({ status: 'cancelled', stage: 'cancelled' }); return current; }
    });
    render(<SuggestPage />, { wrapper: wrapper() });
    await screen.findByText('stage.generating');
    expect(screen.getByRole('button', { name: 'generating' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    await screen.findByText('stage.cancelled');
    expect(transport.post).toHaveBeenCalledTimes(1);
    expect(transport.post).toHaveBeenCalledWith('/tasks/task-1/cancel');
    expect(screen.getByRole('button', { name: 'getSuggestion' })).toBeEnabled();
  });

  it('opens a failed historical request and retries it explicitly', async () => {
    const failed = task({ status: 'failed', stage: 'error', error: 'The provider timed out', error_code: 'timeout' });
    transport.get.mockImplementation(async (path: string) => path === '/tasks' ? { tasks: [failed] } : failed);
    transport.post.mockResolvedValue(task());
    render(<SuggestPage />, { wrapper: wrapper() });
    fireEvent.click((await screen.findByText('status.failed')).closest('button')!);
    await screen.findByText('errors.timeout');
    expect(screen.queryByText('The provider timed out')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => expect(transport.post).toHaveBeenCalledWith('/tasks/task-1/retry'));
    expect(transport.post).toHaveBeenCalledTimes(1);
  });

  it('removes results immediately when a different user enters the page', async () => {
    const completed = task({ status: 'succeeded', stage: 'completed', result: { outfit_ids: ['look-private'] } });
    transport.get.mockImplementation(async (path: string) => {
      if (path === '/tasks') return { tasks: account.id === 'user-a' ? [completed] : [] };
      if (path === '/tasks/task-1') return completed;
      if (path === '/outfits/look-private') return { id: 'look-private', occasion: 'casual', reasoning: 'Private look from account A', items: [] };
    });
    const view = render(<SuggestPage />, { wrapper: wrapper() });
    fireEvent.click((await screen.findByText('status.succeeded')).closest('button')!);
    await screen.findByText('Private look from account A');
    account.id = 'user-b';
    view.rerender(<SuggestPage />);
    expect(screen.queryByText('Private look from account A')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('status.succeeded')).not.toBeInTheDocument());
    expect(transport.post).not.toHaveBeenCalled();
  });
});
