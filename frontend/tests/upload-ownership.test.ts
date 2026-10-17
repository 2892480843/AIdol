// @vitest-environment node
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveSession } from '@/lib/api';
import { enqueueFiles, getPendingUploads, claimLegacyUpload, purgeAbandoned } from '@/lib/upload-queue';
import * as manager from '@/lib/upload-manager';
import { queryKeys } from '@/lib/hooks/query-keys';

function file() { return new File(['photo'], 'photo.jpg', { type: 'image/jpeg', lastModified: 42 }); }
function client() {
  const result = new QueryClient();
  result.setQueryData(queryKeys.features, { max_bulk_upload_count: 20 });
  return result;
}
async function legacyRecord() {
  const { staged } = await enqueueFiles([file()], false);
  const [record] = await getPendingUploads();
  const { ownerId: _owner, ...legacy } = record;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('wardrobe_upload_queue', 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('pending_uploads', 'readwrite');
      tx.objectStore('pending_uploads').put(legacy);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  });
  return staged[0];
}
function success(name = 'photo.jpg') {
  return { ok: true, status: 200, json: async () => ({ total: 1, successful: 1, failed: 0, results: [{ filename: name, success: true }] }) } as Response;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.restoreAllMocks();
  setActiveSession('user-a', 'token-a');
  vi.spyOn(globalThis, 'fetch');
  vi.mocked(fetch).mockReset();
});
afterEach(() => { manager.shutdown(); setActiveSession(null, null); });

describe('persistent upload ownership', () => {
  it('binds new records to one immutable owner and never reuses another account record', async () => {
    const first = await enqueueFiles([file()], false);
    setActiveSession('user-b', 'token-b');
    const second = await enqueueFiles([file()], false);
    await expect(enqueueFiles([file()], false, 'user-a')).rejects.toThrow('Authentication required');
    const records = await getPendingUploads();
    expect(records.map((record) => record.ownerId).sort()).toEqual(['user-a', 'user-b']);
    expect(second.staged[0]).not.toBe(first.staged[0]);
    expect(await claimLegacyUpload(first.staged[0], 'user-b')).toBe(false);
    expect((await getPendingUploads()).find((record) => record.id === first.staged[0])?.ownerId).toBe('user-a');
  });

  it('keeps legacy uploads parked across cleanup until a user explicitly claims them', async () => {
    const id = await legacyRecord();
    manager.init(client());
    await manager.startDrain();
    await purgeAbandoned(-1);
    expect(fetch).not.toHaveBeenCalled();
    expect((await manager.getState()).legacyRecords).toEqual([expect.objectContaining({ id, filename: 'photo.jpg' })]);
    expect(await claimLegacyUpload(id, 'user-a')).toBe(true);
    expect((await getPendingUploads())[0].ownerId).toBe('user-a');
  });

  it('resumes the same owner after a reload and parks other account files', async () => {
    await enqueueFiles([file()], false);
    setActiveSession('user-b', 'token-b');
    manager.init(client());
    await manager.startDrain();
    expect(fetch).not.toHaveBeenCalled();
    expect((await manager.getState()).parkedCount).toBe(1);
    manager.shutdown();
    setActiveSession('user-a', 'token-refreshed');
    manager.init(client());
    vi.mocked(fetch).mockResolvedValue(success());
    await manager.startDrain();
    expect(fetch).toHaveBeenCalledWith('/api/v1/items/bulk', expect.objectContaining({ headers: { Authorization: 'Bearer token-refreshed' } }));
    expect(await getPendingUploads()).toEqual([]);
  });

  it('aborts an in-flight upload on account switch and ignores a late old response', async () => {
    await enqueueFiles([file()], false);
    let finish!: (response: Response) => void;
    let signal!: AbortSignal;
    vi.mocked(fetch).mockImplementation((_url, options) => {
      signal = options?.signal as AbortSignal;
      return new Promise<Response>((resolve) => { finish = resolve; });
    });
    manager.init(client());
    const drain = manager.startDrain();
    for (let i = 0; i < 20 && !finish; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(finish).toBeDefined();
    setActiveSession('user-b', 'token-b');
    expect(signal.aborted).toBe(true);
    await drain;
    finish(success());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await getPendingUploads()).toEqual([expect.objectContaining({ ownerId: 'user-a', attempts: 0 })]);
    expect(fetch).toHaveBeenCalledTimes(1);
    await manager.cancelAll();
    expect(await getPendingUploads()).toHaveLength(1);
  });
});
