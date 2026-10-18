import { API_BASE_PATH } from '@/lib/api';
import { captureLookSession } from '@/lib/looks/session';

export const EXTRACTION_TYPES = ['top', 'pants', 'skirt', 'dress', 'shoes'] as const;
export type ExtractionType = typeof EXTRACTION_TYPES[number];
export type ExtractionErrorCode = 'invalidImage' | 'tooLarge' | 'busy' | 'unavailable' | 'timeout' | 'duplicate' | 'requestFailed' | 'invalidResponse' | 'sessionChanged' | 'cancelled' | 'invalidName';
export class ExtractionError extends Error {
  constructor(public readonly code: ExtractionErrorCode) { super(code); this.name = 'ExtractionError'; }
}
export interface ExtractionCapabilities { available: boolean; model: string; max_bytes: number; max_pixels: number }
export interface ExtractedPiece {
  id: string;
  type: ExtractionType;
  category: 'top' | 'bottom' | 'dress' | 'shoes';
  bbox: { x: number; y: number; width: number; height: number };
  thumbnail_data_url: string;
  confidence: number;
}
export interface ExtractionResult { model: string; pieces: ExtractedPiece[]; image_width: number; image_height: number; warnings: string[] }
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
const MAX_RESPONSE_CHARS = 30 * 1024 * 1024;
const CATEGORY = { top: 'top', pants: 'bottom', skirt: 'bottom', dress: 'dress', shoes: 'shoes' } as const;
const invalid = (): never => { throw new ExtractionError('invalidResponse'); };
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const isExtractionType = (value: unknown): value is ExtractionType => (EXTRACTION_TYPES as readonly unknown[]).includes(value);

function pngBytes(data: unknown): Uint8Array {
  if (typeof data !== 'string' || !data.startsWith('data:image/png;base64,')) return invalid();
  const encoded = data.slice(22);
  if (!encoded.length || encoded.length > Math.ceil(MAX_THUMBNAIL_BYTES / 3) * 4 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return invalid();
  let binary: string;
  try { binary = atob(encoded); } catch { return invalid(); }
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (binary.length < 33 || binary.length > MAX_THUMBNAIL_BYTES || signature.some((byte, i) => binary.charCodeAt(i) !== byte) || binary.slice(12, 16) !== 'IHDR') return invalid();
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width * height > 24_000_000) return invalid();
  return bytes;
}
export function parseExtractionResult(value: unknown): ExtractionResult {
  const data = record(value);
  if (data.model !== 'schp-atr18-int8' || !Array.isArray(data.pieces) || data.pieces.length > 4 || !Number.isInteger(data.image_width) || !Number.isInteger(data.image_height) || (data.image_width as number) < 1 || (data.image_height as number) < 1 || (data.image_width as number) * (data.image_height as number) > 100_000_000 || !Array.isArray(data.warnings) || data.warnings.length > 20 || data.warnings.some(w => typeof w !== 'string' || w.length > 200)) return invalid();
  const seen = new Set<string>();
  const pieces = data.pieces.map(raw => {
    const p = record(raw), box = record(p.bbox);
    if (!isExtractionType(p.type) || p.id !== p.type || seen.has(p.id as string) || p.category !== CATEGORY[p.type] || !finite(p.confidence) || p.confidence < 0 || p.confidence > 1) return invalid();
    if (![box.x, box.y, box.width, box.height].every(finite) || (box.x as number) < 0 || (box.y as number) < 0 || (box.width as number) <= 0 || (box.height as number) <= 0 || (box.x as number) + (box.width as number) > 1.000001 || (box.y as number) + (box.height as number) > 1.000001) return invalid();
    pngBytes(p.thumbnail_data_url);
    seen.add(p.id as string);
    return { id: p.id, type: p.type, category: p.category, bbox: { x: box.x, y: box.y, width: box.width, height: box.height }, thumbnail_data_url: p.thumbnail_data_url, confidence: p.confidence } as ExtractedPiece;
  });
  return { model: data.model as string, pieces, image_width: data.image_width as number, image_height: data.image_height as number, warnings: data.warnings as string[] };
}
export function pieceToFile(piece: Pick<ExtractedPiece, 'id' | 'thumbnail_data_url'>): File {
  if (!isExtractionType(piece.id)) return invalid();
  const bytes = pngBytes(piece.thumbnail_data_url);
  return new File([bytes.buffer as ArrayBuffer], `extracted-${piece.id}.png`, { type: 'image/png' });
}
export function validateSourceFile(file: File, maxBytes = MAX_SOURCE_BYTES) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size) throw new ExtractionError('invalidImage');
  if (file.size > Math.min(maxBytes, MAX_SOURCE_BYTES)) throw new ExtractionError('tooLarge');
}

/** Capture token and owner together. Neither a late response nor a changed token can cross this fence. */
async function request(ownerId: string, path: string, options: RequestInit = {}, signal?: AbortSignal): Promise<unknown> {
  let scope: ReturnType<typeof captureLookSession>;
  try { scope = captureLookSession(ownerId, true); } catch { throw new ExtractionError('sessionChanged'); }
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  scope.signal.addEventListener('abort', abort, { once: true });
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; abort(); }, options.method === 'POST' ? 120_000 : 15_000);
  let rejectAbort: (() => void) | undefined;
  const abortError = () => new ExtractionError(timedOut ? 'timeout' : 'cancelled');
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(abortError());
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
  });
  // A signal may already be aborted before the race starts. Keep its rejection observed.
  void aborted.catch(() => {});
  if (signal?.aborted || scope.signal.aborted) abort();
  try {
    scope.assert();
    if (!scope.token) throw new ExtractionError('sessionChanged');
    if (controller.signal.aborted) throw abortError();
    const data = await Promise.race([(async () => {
      scope.assert();
      const response = await fetch(`${API_BASE_PATH}${path}`, { ...options, cache: 'no-store', credentials: 'include', signal: controller.signal, headers: { ...options.headers, Authorization: `Bearer ${scope.token}` } });
      scope.assert();
      if (controller.signal.aborted) throw abortError();
      if (!response.ok) {
        const codes: Record<number, ExtractionErrorCode> = { 400: 'invalidImage', 413: 'tooLarge', 429: 'busy', 503: 'unavailable', 504: 'timeout', 409: 'duplicate' };
        throw new ExtractionError(codes[response.status] ?? 'requestFailed');
      }
      const length = Number(response.headers.get('content-length'));
      if (length > MAX_RESPONSE_CHARS) return invalid();
      const text = await response.text();
      scope.assert();
      if (controller.signal.aborted) throw abortError();
      if (text.length > MAX_RESPONSE_CHARS) return invalid();
      try { return JSON.parse(text) as unknown; } catch { return invalid(); }
    })(), aborted]);
    scope.assert();
    if (controller.signal.aborted) throw abortError();
    return data;
  } catch (error) {
    try { scope.assert(); } catch { throw new ExtractionError('sessionChanged'); }
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError(timedOut ? 'timeout' : controller.signal.aborted ? 'cancelled' : 'requestFailed');
  } finally {
    clearTimeout(timer);
    scope.dispose();
    scope.signal.removeEventListener('abort', abort);
    signal?.removeEventListener('abort', abort);
    if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort);
  }
}
export async function getExtractionCapabilities(ownerId: string, signal?: AbortSignal): Promise<ExtractionCapabilities> {
  const data = record(await request(ownerId, '/clothing-extraction/capabilities', {}, signal));
  if (typeof data.available !== 'boolean' || typeof data.model !== 'string' || data.model.length > 100 || !Number.isInteger(data.max_bytes) || (data.max_bytes as number) < 1 || !Number.isInteger(data.max_pixels) || (data.max_pixels as number) < 1) return invalid();
  return { available: data.available, model: data.model, max_bytes: Math.min(data.max_bytes as number, MAX_SOURCE_BYTES), max_pixels: Math.min(data.max_pixels as number, 100_000_000) };
}
export async function extractClothing(ownerId: string, file: File, signal?: AbortSignal): Promise<ExtractionResult> {
  const body = new FormData(); body.append('image', file);
  return parseExtractionResult(await request(ownerId, '/clothing-extraction', { method: 'POST', body }, signal));
}
export async function saveExtractedPiece(ownerId: string, piece: ExtractedPiece & { name: string }, signal?: AbortSignal): Promise<{ id: string }> {
  const name = piece.name.trim();
  if (!name || name.length > 100 || /[\u0000-\u001f]/.test(name)) throw new ExtractionError('invalidName');
  if (!isExtractionType(piece.type)) return invalid();
  const body = new FormData();
  body.append('image', pieceToFile(piece)); body.append('name', name); body.append('type', piece.type); body.append('skip_ai', 'true');
  const data = record(await request(ownerId, '/items', { method: 'POST', body }, signal));
  if (typeof data.id !== 'string' || !data.id || data.id.length > 200 || data.user_id !== ownerId) return invalid();
  return { id: data.id };
}
