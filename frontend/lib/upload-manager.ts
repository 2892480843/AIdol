import type { QueryClient } from '@tanstack/react-query';
import { API_BASE_PATH, getAccessToken, getActiveUserId, subscribeActiveSession } from '@/lib/api';
import {
  getPendingUploads,
  markUploading,
  markDone,
  markRetryable,
  markTerminal,
  markPendingForRetry,
  getStoragePersisted,
  purgeAbandoned,
  dismiss as dismissRecord,
  claimLegacyUpload,
  type QueuedUpload,
} from '@/lib/upload-queue';
import {
  bulkUploadLimitFromDetail,
  mergeBulkUploadResponses,
  type BulkUploadErrorCode,
  type BulkUploadResponse,
} from '@/lib/hooks/use-items';
import { fetchBulkUploadLimit } from '@/lib/hooks/use-features';
import { queryKeys } from '@/lib/hooks/query-keys';

// A flat file-count chunk (previously 20) doesn't account for file size: 20
// modern phone photos routinely exceed nginx's default 50MB
// client_max_body_size, producing a 413 that isn't recognized as the known
// "Maximum N images" case (that regex only matches the backend's own
// count-based 400), so the whole chunk lands in retry backoff. Chunking by a
// byte budget well under that cap avoids the 413 in the common case and
// shrinks the retry/close-window blast radius regardless.
const BULK_UPLOAD_CHUNK_SIZE = 8;
const BULK_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
const MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_BASE_MS = 5000;

class BulkLimitExceededError extends Error {
  constructor(public readonly limit: number) {
    super(`Server bulk upload limit is ${limit}`);
  }
}

class PayloadTooLargeError extends Error {
  constructor() {
    super('Bulk upload request failed with status 413');
  }
}

// Codes for files the server will reject again however often they are resent,
// so offering a retry for them would only repeat the failure.
const PERMANENT_ERROR_CODES: ReadonlySet<BulkUploadErrorCode> = new Set<BulkUploadErrorCode>([
  'too_large',
  'unsupported_format',
  'duplicate',
  'invalid_image',
]);

function isRetryable(errorCode: BulkUploadErrorCode | null): boolean {
  return errorCode === null || !PERMANENT_ERROR_CODES.has(errorCode);
}

// The server's max_bulk_upload_count (admin-tunable, self-hosted) rejects the
// WHOLE request, not just the excess files, when a chunk exceeds it. Each
// drain pass caps chunks at the limit /health/features reports; when that is
// unavailable, the limit is learned from the 400 and cached here at module
// scope so later passes stop re-discovering it via a failed request.
let effectiveChunkSize = BULK_UPLOAD_CHUNK_SIZE;

export interface TerminalRecord {
  id: string;
  filename: string;
  size: number;
  lastError: string | null;
  errorCode: BulkUploadErrorCode | null;
  retryable: boolean;
}

export interface DrainState {
  ownerId: string | null;
  draining: boolean;
  remaining: number;
  terminalRecords: TerminalRecord[];
  storagePersisted: boolean | null;
  legacyRecords: Pick<QueuedUpload, 'id' | 'filename' | 'size'>[];
  parkedCount: number;
}

type Listener = (state: DrainState) => void;

let queryClient: QueryClient | null = null;
let isDraining = false;
const listeners = new Set<Listener>();
let beforeUnloadRegistered = false;
let activeController: AbortController | null = null;
let unsubscribeSession: (() => void) | null = null;
let sessionVersion = 0;
let cancelling = false;

interface DrainContext {
  ownerId: string;
  token: string | null;
  version: number;
  controller: AbortController;
  client: QueryClient | null;
}

class UploadSessionChangedError extends Error {}

function isCurrent(context: DrainContext): boolean {
  return !context.controller.signal.aborted && context.version === sessionVersion
    && context.ownerId === getActiveUserId() && context.token === getAccessToken();
}

function assertCurrent(context: DrainContext): void {
  if (!isCurrent(context)) throw new UploadSessionChangedError('Upload paused after session change');
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new UploadSessionChangedError('Upload paused after session change'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  // preventDefault() alone doesn't surface the confirmation dialog in every
  // browser - some still require the legacy returnValue assignment.
  e.preventDefault();
  e.returnValue = '';
}

async function computeState(): Promise<DrainState> {
  const ownerId = getActiveUserId();
  const allRecords = await getPendingUploads();
  const records = ownerId ? allRecords.filter((record) => record.ownerId === ownerId) : [];
  const remaining = records.filter((r) => r.status !== 'failed').length;
  const terminalRecords: TerminalRecord[] = records
    .filter((r) => r.terminal)
    .map((r) => {
      const errorCode = r.errorCode ?? null;
      return {
        id: r.id,
        filename: r.filename,
        size: r.size,
        lastError: r.lastError,
        errorCode,
        retryable: isRetryable(errorCode),
      };
    });
  const storagePersisted = await getStoragePersisted();

  if (typeof window !== 'undefined') {
    if (remaining > 0 && !beforeUnloadRegistered) {
      window.addEventListener('beforeunload', onBeforeUnload);
      beforeUnloadRegistered = true;
    } else if (remaining === 0 && beforeUnloadRegistered) {
      window.removeEventListener('beforeunload', onBeforeUnload);
      beforeUnloadRegistered = false;
    }
  }

  return {
    ownerId, draining: isDraining && !activeController?.signal.aborted, remaining, terminalRecords, storagePersisted,
    legacyRecords: allRecords.filter((record) => !record.ownerId).map(({ id, filename, size }) => ({ id, filename, size })),
    parkedCount: allRecords.filter((record) => record.ownerId && record.ownerId !== ownerId).length,
  };
}

async function emit(): Promise<void> {
  const state = await computeState();
  if (state.ownerId === getActiveUserId()) listeners.forEach((listener) => listener(state));
}

export function init(client: QueryClient): void {
  queryClient = client;
  effectiveChunkSize = BULK_UPLOAD_CHUNK_SIZE;
  if (!unsubscribeSession) {
    unsubscribeSession = subscribeActiveSession(() => {
      sessionVersion += 1;
      activeController?.abort();
      clearReschedule();
      // Emit asynchronously so the old account scope can finish unmounting.
      queueMicrotask(() => { void emit(); void startDrain(); });
    });
  }
}

export function shutdown(): void {
  sessionVersion += 1;
  activeController?.abort();
  clearReschedule();
  unsubscribeSession?.();
  unsubscribeSession = null;
  queryClient = null;
  if (beforeUnloadRegistered && typeof window !== 'undefined') {
    window.removeEventListener('beforeunload', onBeforeUnload);
    beforeUnloadRegistered = false;
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function getState(): Promise<DrainState> {
  return computeState();
}

async function uploadChunk(chunk: QueuedUpload[], context: DrainContext): Promise<BulkUploadResponse> {
  assertCurrent(context);
  const formData = new FormData();
  chunk.forEach((record) => formData.append('images', record.file, record.filename));
  formData.append('skip_ai', String(chunk[0]?.skipAi ?? false));
  chunk.forEach((record) => formData.append('upload_keys', record.id));

  const response = await abortable(fetch(`${API_BASE_PATH}/items/bulk`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers: context.token ? { Authorization: `Bearer ${context.token}` } : undefined,
    signal: context.controller.signal,
  }), context.controller.signal);
  assertCurrent(context);

  if (!response.ok) {
    if (response.status === 413) {
      throw new PayloadTooLargeError();
    }
    if (response.status === 400) {
      const body = await abortable(response.json().catch(() => null), context.controller.signal);
      assertCurrent(context);
      const limit = bulkUploadLimitFromDetail(body?.detail);
      if (limit !== null) {
        throw new BulkLimitExceededError(limit);
      }
    }
    throw new Error(`Bulk upload request failed with status ${response.status}`);
  }
  const result = await abortable(response.json() as Promise<BulkUploadResponse>, context.controller.signal);
  assertCurrent(context);
  return result;
}

async function uploadChunkWithinServerLimit(chunk: QueuedUpload[], context: DrainContext): Promise<BulkUploadResponse> {
  try {
    return await uploadChunk(chunk, context);
  } catch (error) {
    if (error instanceof BulkLimitExceededError && error.limit > 0 && error.limit < chunk.length) {
      effectiveChunkSize = Math.min(effectiveChunkSize, error.limit);
      const responses: BulkUploadResponse[] = [];
      for (let i = 0; i < chunk.length; i += error.limit) {
        responses.push(await uploadChunkWithinServerLimit(chunk.slice(i, i + error.limit), context));
      }
      return mergeBulkUploadResponses(responses);
    }
    throw error;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Upload failed';
}

async function drainOnce(context: DrainContext): Promise<boolean> {
  const records = await getPendingUploads();
  if (!isCurrent(context)) return false;
  // A record left 'uploading' means a previous drain (this tab or another)
  // died mid-chunk. Safe to resend unconditionally - the upload_key unique
  // constraint on the backend makes a duplicate send a no-op, not a
  // duplicate item, so no cross-drain coordination is needed here.
  //
  // A retried 'pending' record (attempts > 0) is gated by a linear backoff
  // on updatedAt so a persistent failure doesn't burn through MAX_ATTEMPTS
  // in a single tight loop within one startDrain() call - each attempt
  // needs its own drain pass, not just its own loop iteration.
  const now = Date.now();
  const actionable = records.filter((r) => {
    if (r.ownerId !== context.ownerId) return false;
    if (r.status === 'uploading') return true;
    if (r.status !== 'pending') return false;
    if (r.attempts === 0) return true;
    return now - r.updatedAt >= r.attempts * RETRY_BACKOFF_BASE_MS;
  });
  if (actionable.length === 0) return false;

  // A chunk request carries one skip_ai value - keep chunks homogeneous
  // rather than threading a per-file flag through the endpoint.
  const skipAi = actionable[0].skipAi;
  const matching = actionable.filter((r) => r.skipAi === skipAi);
  const serverLimit = context.client ? await fetchBulkUploadLimit(context.client) : null;
  if (!isCurrent(context)) return false;
  const maxFiles = Math.min(effectiveChunkSize, serverLimit ?? effectiveChunkSize);
  const chunk: QueuedUpload[] = [];
  let chunkBytes = 0;
  for (const record of matching) {
    if (chunk.length >= maxFiles) break;
    // Always take at least one file, even if it alone exceeds the budget -
    // a single oversized file must still make progress, not stall forever.
    if (chunk.length > 0 && chunkBytes + record.size > BULK_UPLOAD_MAX_BYTES) break;
    chunk.push(record);
    chunkBytes += record.size;
  }

  for (const record of chunk) {
    await markUploading(record.id);
  }
  await emit();

  try {
    const response = await uploadChunkWithinServerLimit(chunk, context);
    assertCurrent(context);
    await Promise.all(
      response.results.map(async (result, idx) => {
        const record = chunk[idx];
        if (!record) return;
        if (result.success || result.duplicate) {
          await markDone(record.id);
        } else {
          await markTerminal(record.id, result.error ?? 'Upload failed', result.error_code ?? null);
        }
      })
    );
  } catch (error) {
    // Retain uploading records and their idempotency keys for the original
    // account. A late response must not delete blobs or count as a failed try.
    if (!isCurrent(context) || error instanceof UploadSessionChangedError) return false;
    const message = errorMessage(error);
    // A 413 for a chunk of one file means that file alone is over the proxy's
    // body limit, so resending it can never succeed.
    if (error instanceof PayloadTooLargeError && chunk.length === 1) {
      await markTerminal(chunk[0].id, message, 'too_large');
    } else {
      await Promise.all(
        chunk.map((record) =>
          record.attempts + 1 >= MAX_ATTEMPTS
            ? markTerminal(record.id, message)
            : markRetryable(record.id, message)
        )
      );
    }
  }

  if (isCurrent(context)) context.client?.invalidateQueries({ queryKey: queryKeys.items.all });
  await emit();
  return true;
}

let rescheduleTimer: ReturnType<typeof setTimeout> | null = null;

function clearReschedule(): void {
  if (rescheduleTimer !== null) {
    clearTimeout(rescheduleTimer);
    rescheduleTimer = null;
  }
}

// When every pending record is inside its retry backoff window, drainOnce()
// has nothing actionable and returns false, so the loop below exits and
// isDraining flips back to false - correctly, so the UI doesn't show a
// spinner for the whole backoff wait. But without this, nothing ever calls
// startDrain() again except a page reload or new items being added, so a
// batch that all landed in backoff at once (e.g. every record in a chunk hit
// the same network failure) wedges permanently. This finds the soonest a
// record becomes actionable and arms a timer to resume then.
async function nextBackoffDelayMs(ownerId: string): Promise<number | null> {
  const records = await getPendingUploads();
  const now = Date.now();
  let minDelay: number | null = null;
  for (const record of records) {
    if (record.ownerId !== ownerId) continue;
    if (record.status !== 'pending' || record.attempts === 0) continue;
    const readyAt = record.updatedAt + record.attempts * RETRY_BACKOFF_BASE_MS;
    const delay = readyAt - now;
    if (delay > 0 && (minDelay === null || delay < minDelay)) {
      minDelay = delay;
    }
  }
  return minDelay;
}

export async function startDrain(): Promise<void> {
  const ownerId = getActiveUserId();
  if (isDraining || cancelling || !ownerId || !queryClient) return;
  clearReschedule();
  const context: DrainContext = { ownerId, token: getAccessToken(), version: sessionVersion, controller: new AbortController(), client: queryClient };
  activeController = context.controller;
  isDraining = true;
  await emit();
  try {
    await purgeAbandoned(undefined, ownerId);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const madeProgress = await drainOnce(context);
      if (!madeProgress) break;
    }
  } finally {
    isDraining = false;
    activeController = null;
    await emit();
  }

  if (!isCurrent(context)) {
    if (queryClient && getActiveUserId()) queueMicrotask(() => { void startDrain(); });
    return;
  }
  const delay = await nextBackoffDelayMs(ownerId);
  if (!isCurrent(context)) return;
  if (delay !== null) {
    rescheduleTimer = setTimeout(() => {
      rescheduleTimer = null;
      void startDrain();
    }, delay);
  }
}

export async function retry(id: string): Promise<void> {
  if (!(await ownedRecord(id))) return;
  await markPendingForRetry(id);
  void startDrain();
}

export async function retryAll(): Promise<void> {
  const { terminalRecords, ownerId } = await computeState();
  if (ownerId !== getActiveUserId()) return;
  await Promise.all(
    terminalRecords.filter((r) => r.retryable).map((r) => markPendingForRetry(r.id))
  );
  void startDrain();
}

export async function dismiss(id: string): Promise<void> {
  if (!(await ownedRecord(id))) return;
  await dismissRecord(id);
  await emit();
}

export async function dismissAll(): Promise<void> {
  const { terminalRecords, ownerId } = await computeState();
  if (ownerId !== getActiveUserId()) return;
  await Promise.all(terminalRecords.map((r) => dismissRecord(r.id)));
  await emit();
}

export async function cancelAll(): Promise<void> {
  // Unlike dismissAll (terminal records only), this also clears records
  // stuck in 'pending'/'uploading' - the only recovery path for a record
  // whose durable write to IndexedDB never actually landed, so it never
  // becomes terminal on its own.
  clearReschedule();
  cancelling = true;
  activeController?.abort();
  const ownerId = getActiveUserId();
  try {
    const records = await getPendingUploads();
    if (ownerId !== getActiveUserId()) return;
    await Promise.all(records.filter((record) => ownerId && record.ownerId === ownerId).map((r) => dismissRecord(r.id)));
    await emit();
  } finally {
    cancelling = false;
    if (ownerId !== getActiveUserId()) void startDrain();
  }
}

async function ownedRecord(id: string): Promise<QueuedUpload | undefined> {
  const ownerId = getActiveUserId();
  const records = await getPendingUploads();
  return ownerId && ownerId === getActiveUserId() ? records.find((record) => record.id === id && record.ownerId === ownerId) : undefined;
}

export async function claimLegacy(id: string, expectedOwnerId: string): Promise<void> {
  if (expectedOwnerId !== getActiveUserId()) return;
  if (await claimLegacyUpload(id, expectedOwnerId)) {
    await emit();
    void startDrain();
  }
}
