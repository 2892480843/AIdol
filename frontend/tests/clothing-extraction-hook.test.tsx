import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveSession } from '@/lib/api';
import { useClothingExtraction } from '@/lib/hooks/use-clothing-extraction';
import { queryKeys } from '@/lib/hooks/query-keys';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const pieces = ['top', 'pants'].map(type => ({ id: type, type, category: type === 'top' ? 'top' : 'bottom', bbox: { x: 0, y: 0, width: 1, height: 1 }, thumbnail_data_url: png, confidence: .9 }));
const extracted = { model: 'schp-atr18-int8', pieces, image_width: 400, image_height: 800, warnings: [] };
const ok = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const file = () => new File(['photo'], 'look.jpg', { type: 'image/jpeg' });
let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;
const revoke = vi.fn();
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
beforeEach(() => {
  setActiveSession('owner-a', 'token-a');
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  fetchMock = vi.fn().mockResolvedValue(ok({ available: true, model: 'schp-atr18-int8', max_bytes: 8000000, max_pixels: 20000000 }));
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:private-photo'); URL.revokeObjectURL = revoke; revoke.mockClear();
});
afterEach(() => { client.clear(); act(() => setActiveSession(null, null)); vi.unstubAllGlobals(); });
async function ready() {
  const hook = renderHook(() => useClothingExtraction('owner-a'), { wrapper });
  await waitFor(() => expect(hook.result.current.capabilities?.available).toBe(true));
  act(() => hook.result.current.choose(file()));
  fetchMock.mockResolvedValueOnce(ok(extracted));
  await act(() => hook.result.current.extract(type => type));
  return hook;
}

describe('explicit candidate review', () => {
  it('never writes on mount, file selection or extraction and saves only checked reviewed pieces', async () => {
    const invalidations = vi.spyOn(client, 'invalidateQueries');
    const { result } = await ready();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/v1/clothing-extraction/capabilities', '/api/v1/clothing-extraction']);
    expect(result.current.candidates).toHaveLength(2);
    act(() => { result.current.edit('pants', { selected: false }); result.current.edit('top', { name: 'Edited top', type: 'dress' }); });
    fetchMock.mockResolvedValueOnce(ok({ id: 'saved-1', user_id: 'owner-a' }, 201));
    await act(() => result.current.saveSelected());
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].body.get('name')).toBe('Edited top');
    expect(fetchMock.mock.calls[2][1].body.get('type')).toBe('dress');
    expect(result.current.candidates[0].status).toBe('saved');
    expect(result.current.candidates[1].status).toBe('idle');
    expect(invalidations).toHaveBeenCalledWith({ queryKey: queryKeys.items.all });
    await act(() => result.current.saveSelected());
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('retries only failed pieces after a partial failure, never a successful piece', async () => {
    const { result } = await ready();
    fetchMock.mockResolvedValueOnce(ok({ id: 'saved-top', user_id: 'owner-a' }, 201)).mockResolvedValueOnce(ok({}, 500));
    await act(() => result.current.saveSelected());
    expect(result.current.candidates.map(p => p.status)).toEqual(['saved', 'error']);
    fetchMock.mockResolvedValueOnce(ok({ id: 'saved-pants', user_id: 'owner-a' }, 201));
    await act(() => result.current.saveSelected());
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls[4][1].body.get('type')).toBe('pants');
    expect(result.current.candidates.map(p => p.status)).toEqual(['saved', 'saved']);
  });
  it('marks a duplicate without retrying it on the next explicit save', async () => {
    const { result } = await ready();
    fetchMock.mockResolvedValueOnce(ok({}, 409)).mockResolvedValueOnce(ok({ id: 'saved-pants', user_id: 'owner-a' }, 201));
    await act(() => result.current.saveSelected());
    expect(result.current.candidates.map(p => p.status)).toEqual(['duplicate', 'saved']);
    await act(() => result.current.saveSelected());
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('aborts extraction on replacement and revokes the old photo URL', async () => {
    const { result, unmount } = await ready();
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    let pending!: Promise<void>;
    act(() => { pending = result.current.extract(type => type); });
    const signal = fetchMock.mock.calls[2][1].signal;
    act(() => result.current.choose(file()));
    expect(signal.aborted).toBe(true);
    expect(revoke).toHaveBeenCalledWith('blob:private-photo');
    await act(async () => { finish(ok(extracted)); await pending; });
    expect(result.current.candidates).toEqual([]);
    unmount(); expect(revoke).toHaveBeenCalledTimes(2);
  });
  it('stops the remaining saves when an account changes and ignores a late response', async () => {
    const { result } = await ready();
    const invalidations = vi.spyOn(client, 'invalidateQueries');
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    let pending!: Promise<void>;
    act(() => { pending = result.current.saveSelected(); });
    act(() => setActiveSession('owner-b', 'token-b'));
    await act(async () => { finish(ok({ id: 'old-owner-item', user_id: 'owner-a' }, 201)); await pending; });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.candidates).toEqual([]);
    expect(invalidations).not.toHaveBeenCalled();
  });
  it('clears private previews immediately across sign-out and return, rejects old callbacks', async () => {
    const { result } = await ready();
    const staleSave = result.current.saveSelected;
    act(() => { setActiveSession(null, null); setActiveSession('owner-a', 'token-a'); });
    expect(result.current.candidates).toEqual([]);
    expect(result.current.previewUrl).toBeNull();
    await act(() => staleSave());
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/v1/items')).toHaveLength(0);
  });
  it('clearly disables extraction when the service is unavailable', async () => {
    fetchMock.mockResolvedValue(ok({ available: false, model: 'schp-atr18-int8', max_bytes: 8000000, max_pixels: 20000000 }));
    const { result } = renderHook(() => useClothingExtraction('owner-a'), { wrapper });
    await waitFor(() => expect(result.current.capabilities?.available).toBe(false));
    act(() => result.current.choose(file()));
    await act(() => result.current.extract(type => type));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.current.error).toBe('unavailable');
  });
});
