import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkError } from '@/lib/api';
import { useRecommendationTasks } from '@/lib/recommendations/use-recommendation-tasks';
import type { RecommendationTask } from '@/lib/recommendations/types';

const auth = vi.hoisted(() => ({
  session: { user: { id: 'user-a' }, accessToken: 'token-a' },
  status: 'authenticated',
}));
const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: auth.session, status: auth.status }) }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  api: transport,
}));

function task(overrides: Partial<RecommendationTask> = {}): RecommendationTask {
  return {
    id: 'task-1', kind: 'recommendation', status: 'queued', stage: 'queued',
    attempts: 0, max_attempts: 3, created_at: '2026-10-17T10:00:00Z',
    updated_at: '2026-10-17T10:00:00Z', request: { occasion: 'casual', count: 3 },
    result: null, error: null, error_code: null, ...overrides,
  };
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.session = { user: { id: 'user-a' }, accessToken: 'token-a' };
  auth.status = 'authenticated';
  transport.get.mockResolvedValue({ tasks: [] });
});

describe('durable recommendation tasks', () => {
  it('restores server work after reload and polls through completion without submitting again', async () => {
    const queued = task();
    const completed = task({ status: 'succeeded', stage: 'completed', result: { outfit_ids: ['look-1'] } });
    transport.get.mockImplementation(async (path: string) => {
      if (path === '/tasks') return { tasks: [queued] };
      if (path === '/tasks/task-1') return completed;
      if (path === '/outfits/look-1') return { id: 'look-1', occasion: 'casual', items: [] };
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => useRecommendationTasks({ pollInterval: 10 }), { wrapper });
    await waitFor(() => expect(result.current.outfits?.[0]?.id).toBe('look-1'));
    expect(result.current.activeTask?.status).toBe('succeeded');
    expect(transport.post).not.toHaveBeenCalled();
  });

  it('polls queued and running stages and stops requesting after cancellation', async () => {
    let current = task();
    transport.get.mockImplementation(async (path: string) => path === '/tasks' ? { tasks: [current] } : current);
    transport.post.mockImplementation(async () => {
      current = task({ status: 'cancelled', stage: 'cancelled' });
      return current;
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => useRecommendationTasks({ pollInterval: 15 }), { wrapper });
    await waitFor(() => expect(result.current.activeTask?.status).toBe('queued'));
    current = task({ status: 'running', stage: 'generating', attempts: 1 });
    await waitFor(() => expect(result.current.activeTask?.stage).toBe('generating'));
    await act(async () => { await result.current.cancel('task-1'); });
    await waitFor(() => expect(result.current.activeTask?.status).toBe('cancelled'));
    const calls = transport.get.mock.calls.length;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
    expect(transport.get).toHaveBeenCalledTimes(calls);
  });

  it('keeps a restored task selected when it finishes before the outfit detail finishes loading', async () => {
    let current = task();
    let finishOutfit!: (outfit: { id: string }) => void;
    const pendingOutfit = new Promise<{ id: string }>((resolve) => { finishOutfit = resolve; });
    transport.get.mockImplementation(async (path: string) => {
      if (path === '/tasks') return { tasks: [current] };
      if (path === '/tasks/task-1') return current;
      if (path === '/outfits/look-1') return pendingOutfit;
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => useRecommendationTasks({ pollInterval: 15 }), { wrapper });
    await waitFor(() => expect(result.current.activeTask?.status).toBe('queued'));
    current = task({ status: 'succeeded', stage: 'completed', result: { outfit_ids: ['look-1'] } });
    await waitFor(() => expect(result.current.tasks[0]?.status).toBe('succeeded'));
    expect(result.current.activeTask?.id).toBe('task-1');
    await act(async () => { finishOutfit({ id: 'look-1' }); await pendingOutfit; });
    await waitFor(() => expect(result.current.outfits?.[0]?.id).toBe('look-1'));
  });

  it('submits the full request once and reuses its idempotency key after a network failure', async () => {
    transport.post.mockRejectedValueOnce(new NetworkError()).mockResolvedValueOnce(task());
    transport.get.mockImplementation(async (path: string) => path === '/tasks' ? { tasks: [] } : task());
    const { wrapper } = setup();
    const { result } = renderHook(() => useRecommendationTasks(), { wrapper });
    const request = { occasion: 'work', count: 3 as const, include_items: ['item-1'], exclude_items: ['item-2'], weather_override: { temperature: 22, humidity: 50, precipitation_chance: 10, condition: 'sunny' } };
    await act(async () => { await result.current.submit(request); });
    expect(transport.post).toHaveBeenCalledTimes(2);
    const [first, second] = transport.post.mock.calls;
    expect(first[0]).toBe('/tasks/recommendations');
    expect(first[1]).toEqual(request);
    expect(first[2].headers['Idempotency-Key']).toBeTruthy();
    expect(first[2].headers['Idempotency-Key']).toBe(second[2].headers['Idempotency-Key']);
  });

  it('cancels a running task through the server and stops polling terminal work', async () => {
    const running = task({ status: 'running', stage: 'generating' });
    transport.get.mockImplementation(async (path: string) => path === '/tasks' ? { tasks: [running] } : running);
    transport.post.mockResolvedValue(task({ status: 'cancelled', stage: 'cancelled' }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useRecommendationTasks(), { wrapper });
    await waitFor(() => expect(result.current.activeTask?.id).toBe('task-1'));
    await act(async () => { await result.current.cancel('task-1'); });
    expect(transport.post).toHaveBeenCalledWith('/tasks/task-1/cancel');
    expect(result.current.activeTask?.status).toBe('cancelled');
  });

  it('does not let an in-flight status response overwrite a confirmed cancellation', async () => {
    const running = task({ status: 'running', stage: 'generating' });
    let finishStatus!: (value: RecommendationTask) => void;
    transport.get.mockImplementation(async (path: string) => path === '/tasks' ? { tasks: [running] } : new Promise<RecommendationTask>((resolve) => { finishStatus = resolve; }));
    transport.post.mockResolvedValue(task({ status: 'cancelled', stage: 'cancelled' }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useRecommendationTasks(), { wrapper });
    await waitFor(() => expect(finishStatus).toBeTypeOf('function'));
    await act(async () => { await result.current.cancel('task-1'); });
    expect(result.current.activeTask?.status).toBe('cancelled');
    await act(async () => { finishStatus(running); });
    expect(result.current.activeTask?.status).toBe('cancelled');
  });

  it('retries a failed task explicitly without replaying its generation request', async () => {
    const failed = task({ status: 'failed', stage: 'error', error: 'Model timed out' });
    transport.get.mockImplementation(async (path: string) => path === '/tasks' ? { tasks: [failed] } : failed);
    transport.post.mockResolvedValue(task());
    const { wrapper } = setup();
    const { result } = renderHook(() => useRecommendationTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    act(() => result.current.openTask('task-1'));
    await waitFor(() => expect(result.current.activeTask?.status).toBe('failed'));
    await act(async () => { await result.current.retry('task-1'); });
    expect(transport.post).toHaveBeenCalledWith('/tasks/task-1/retry');
    expect(result.current.activeTask?.status).toBe('queued');
  });

  it('isolates task caches and ignores an old submission response when the user changes', async () => {
    let finishSubmission!: (value: RecommendationTask) => void;
    transport.post.mockImplementation(() => new Promise<RecommendationTask>((resolve) => { finishSubmission = resolve; }));
    const { wrapper, client } = setup();
    const { result, rerender } = renderHook(() => useRecommendationTasks(), { wrapper });
    let submitted!: Promise<unknown>;
    act(() => { submitted = result.current.submit({ occasion: 'casual', count: 1 }); });
    await waitFor(() => expect(transport.post).toHaveBeenCalledTimes(1));
    auth.session = { user: { id: 'user-b' }, accessToken: 'token-b' };
    rerender();
    await waitFor(() => expect(result.current.tasks).toEqual([]));
    await act(async () => { finishSubmission(task()); await submitted; });
    expect(result.current.activeTask).toBeNull();
    expect(result.current.outfits).toBeUndefined();
    expect(client.getQueryCache().findAll({ queryKey: ['recommendation-tasks', 'user-a'] })).not.toHaveLength(0);
    expect(client.getQueryCache().findAll({ queryKey: ['recommendation-tasks', 'user-b'] })).not.toHaveLength(0);
  });

  it('waits for an authenticated user identity before requesting private tasks', async () => {
    auth.status = 'unauthenticated';
    const { wrapper } = setup();
    const { result } = renderHook(() => useRecommendationTasks(), { wrapper });
    expect(result.current.tasks).toEqual([]);
    expect(transport.get).not.toHaveBeenCalled();
    expect(transport.post).not.toHaveBeenCalled();
  });
});
