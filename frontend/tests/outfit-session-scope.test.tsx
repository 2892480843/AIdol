import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveSession } from '@/lib/api';
import { queryKeys } from '@/lib/hooks/query-keys';
import { useBulkDeleteOutfits, useCalendarOutfits, useOutfits } from '@/lib/hooks/use-outfits';

const account = vi.hoisted(() => ({ id: 'owner-a', token: 'token-a' }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: account.id }, accessToken: account.token }, status: 'authenticated' }),
}));

const response = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const emptyPage = { outfits: [], total: 0, page: 1, page_size: 100, has_more: false };
let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  account.id = 'owner-a';
  account.token = 'token-a';
  setActiveSession(account.id, account.token);
  fetchMock = vi.fn().mockResolvedValue(response({ deleted: 1, failed: 0, errors: [] }));
  vi.stubGlobal('fetch', fetchMock);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});

afterEach(() => {
  client.clear();
  setActiveSession(null, null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('outfit bulk delete account boundary', () => {
  it.each(['switch', 'sign-out-and-return'] as const)(
    'does not send a select-all delete after %s during awaited onMutate', async (change) => {
      let release!: () => void;
      const paused = new Promise<void>((resolve) => { release = resolve; });
      const cancellation = vi.spyOn(client, 'cancelQueries').mockReturnValueOnce(paused);
      const key = queryKeys.outfits.list({}, 1, 20);
      const { result, rerender } = renderHook(useBulkDeleteOutfits, { wrapper });
      let operation!: Promise<unknown>;
      act(() => {
        operation = result.current.mutateAsync({ select_all: true }).catch((error) => error);
      });
      await waitFor(() => expect(cancellation).toHaveBeenCalledOnce());
      if (change === 'switch') {
        account.id = 'owner-b'; account.token = 'token-b';
        setActiveSession(account.id, account.token);
      } else {
        setActiveSession(null, null);
        setActiveSession('owner-a', 'token-a');
      }
      rerender();
      const currentPage = { ...emptyPage, outfits: [{ id: 'current-account-look' }], total: 1 };
      client.setQueryData(key, currentPage);
      let outcome: unknown;
      await act(async () => { release(); outcome = await operation; });
      expect(outcome).toBeInstanceOf(Error);
      expect((outcome as Error).message).toMatch(/session change/i);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(client.getQueryData(key)).toEqual(currentPage);
    },
  );

  it('rejects an old mutateAsync callback invoked after a different account takes over', async () => {
    const { result } = renderHook(useBulkDeleteOutfits, { wrapper });
    const oldDelete = result.current.mutateAsync;
    setActiveSession('owner-b', 'token-b');
    await act(async () => {
      await expect(oldDelete({ select_all: true })).rejects.toThrow(/session change/i);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts an in-flight request and does not restore old cache after its late failure', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const key = queryKeys.outfits.list({}, 1, 20);
    client.setQueryData(key, { ...emptyPage, outfits: [{ id: 'old-account-look' }], total: 1 });
    const { result, rerender } = renderHook(useBulkDeleteOutfits, { wrapper });
    let operation!: Promise<unknown>;
    act(() => { operation = result.current.mutateAsync({ select_all: true }).catch((error) => error); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal;
    account.id = 'owner-b'; account.token = 'token-b';
    setActiveSession(account.id, account.token);
    rerender();
    const currentPage = { ...emptyPage, outfits: [{ id: 'current-account-look' }], total: 1 };
    client.setQueryData(key, currentPage);
    await act(async () => {
      finish({ ok: false, status: 503, json: async () => ({ detail: 'temporary failure' }) } as Response);
      await operation;
    });
    expect(signal?.aborted).toBe(true);
    expect(client.getQueryData(key)).toEqual(currentPage);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('outfit calendar scope', () => {
  it.each([true, false])('serializes an explicit worn=%s on paged list requests', async (worn) => {
    fetchMock.mockResolvedValue(response(emptyPage));
    const { result } = renderHook(() => useOutfits({ worn, is_lookbook: false }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://frontend');
    expect(url.searchParams.get('worn')).toBe(String(worn));
    expect(url.searchParams.has('status')).toBe(false);
  });

  it('passes all supported list scopes to the real calendar API request', async () => {
    fetchMock.mockResolvedValue(response(emptyPage));
    const { result } = renderHook(() => useCalendarOutfits(2026, 10, {
      status: 'accepted', occasion: 'casual', source: 'manual', is_lookbook: false,
      is_replacement: true, has_source_item: true, search: 'linen', occasions: ['casual', 'office'],
      cloned_from_outfit_id: 'template-1', item_type: 'shirt', worn: true,
    }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://frontend');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '1', page_size: '100', date_from: '2026-10-01', date_to: '2026-10-31',
      status: 'accepted', occasion: 'casual', source: 'manual', is_lookbook: 'false',
      is_replacement: 'true', has_source_item: 'true', search: 'linen', occasions: 'casual,office',
      cloned_from_outfit_id: 'template-1', item_type: 'shirt', worn: 'true',
    });
  });
});
