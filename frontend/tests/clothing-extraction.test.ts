import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveSession } from '@/lib/api';
import { extractClothing, getExtractionCapabilities, parseExtractionResult, pieceToFile, saveExtractedPiece, validateSourceFile, ExtractionError, MAX_THUMBNAIL_BYTES } from '@/lib/clothing-extraction';

export const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const piece = { id: 'top', type: 'top', category: 'top', bbox: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 }, thumbnail_data_url: png, confidence: 0.9 };
const result = (pieces: unknown[] = [piece]) => ({ model: 'schp-atr18-int8', pieces, image_width: 400, image_height: 800, warnings: [] });
const ok = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { setActiveSession('owner-a', 'token-a'); fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { setActiveSession(null, null); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('untrusted extraction data', () => {
  it('accepts real bounded PNG pieces and converts without a network fetch', () => {
    const parsed = parseExtractionResult(result());
    const file = pieceToFile(parsed.pieces[0]);
    expect(file.type).toBe('image/png');
    expect(file.name).toBe('extracted-top.png');
    expect(file.size).toBeGreaterThan(20);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  const unsafe = [
    [{ ...piece, thumbnail_data_url: 'https://example.org/private.png' }],
    [{ ...piece, thumbnail_data_url: 'data:image/png;base64,SGVsbG8=' }],
    [{ ...piece, thumbnail_data_url: 'data:image/png;base64,' + 'A'.repeat(MAX_THUMBNAIL_BYTES * 2) }],
    [{ ...piece, confidence: NaN }],
    [{ ...piece, bbox: { ...piece.bbox, width: 1 } }],
    [{ ...piece, bbox: { ...piece.bbox, x: -0.1 } }],
    [{ ...piece, type: 'bag' }],
    [{ ...piece, category: 'shoes' }],
    [piece, piece],
    Array.from({ length: 5 }, () => piece),
  ];
  it.each(unsafe.map((pieces, i) => ({ pieces, i })))('rejects unsafe response $i', ({ pieces }) => { expect(() => parseExtractionResult(result(pieces))).toThrow(ExtractionError); });
  it('rejects unsupported source formats, empty files and a capability size overflow', () => {
    expect(() => validateSourceFile(new File(['x'], 'x.svg', { type: 'image/svg+xml' }), 100)).toThrow();
    expect(() => validateSourceFile(new File([], 'x.png', { type: 'image/png' }), 100)).toThrow();
    expect(() => validateSourceFile(new File(['123'], 'x.png', { type: 'image/png' }), 2)).toThrow();
  });
});

describe('owner-fenced real requests', () => {
  it('loads capabilities, extracts without saving, then explicitly writes one reviewed PNG', async () => {
    fetchMock.mockResolvedValueOnce(ok({ available: true, model: 'schp-atr18-int8', max_bytes: 8000000, max_pixels: 20000000 })).mockResolvedValueOnce(ok(result())).mockResolvedValueOnce(ok({ id: 'item-1', user_id: 'owner-a' }, 201));
    expect((await getExtractionCapabilities('owner-a')).available).toBe(true);
    const extracted = await extractClothing('owner-a', new File(['photo'], 'outfit.jpg', { type: 'image/jpeg' }));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/v1/clothing-extraction/capabilities', '/api/v1/clothing-extraction']);
    expect(await saveExtractedPiece('owner-a', { ...extracted.pieces[0], name: '  My top  ' })).toEqual({ id: 'item-1' });
    const options = fetchMock.mock.calls[2][1];
    expect(options.headers.Authorization).toBe('Bearer token-a');
    expect(options.body.get('name')).toBe('My top');
    expect(options.body.get('type')).toBe('top');
    expect(options.body.get('skip_ai')).toBe('true');
    expect(options.body.get('image').type).toBe('image/png');
    expect(options.headers['Content-Type']).toBeUndefined();
  });
  it.each([[400, 'invalidImage'], [413, 'tooLarge'], [429, 'busy'], [503, 'unavailable'], [504, 'timeout'], [409, 'duplicate']])('maps HTTP %i to a stable localized code', async (status, code) => {
    fetchMock.mockResolvedValue(ok({ detail: 'private raw error' }, status as number));
    await expect(extractClothing('owner-a', new File(['x'], 'x.png'))).rejects.toMatchObject({ code });
  });
  it('aborts a pending response when the token changes, even if fetch ignores cancellation', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = extractClothing('owner-a', new File(['x'], 'x.png')).catch(error => error);
    const signal = fetchMock.mock.calls[0][1].signal;
    setActiveSession('owner-a', 'token-b');
    expect(signal.aborted).toBe(true);
    expect(await pending).toMatchObject({ code: 'sessionChanged' });
    finish(ok(result()));
  });
  it('rejects an old owner before transmitting and mismatched saved ownership', async () => {
    await expect(getExtractionCapabilities('owner-b')).rejects.toMatchObject({ code: 'sessionChanged' });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(ok({ id: 'wrong-item', user_id: 'owner-b' }, 201));
    await expect(saveExtractedPiece('owner-a', { ...piece, type: 'top', category: 'top', name: 'top' } as Parameters<typeof saveExtractedPiece>[1])).rejects.toMatchObject({ code: 'invalidResponse' });
  });
  it('times out, aborts and clears request listeners instead of waiting forever', async () => {
    vi.useFakeTimers(); fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = getExtractionCapabilities('owner-a').catch(error => error);
    await vi.advanceTimersByTimeAsync(15001);
    expect(await pending).toMatchObject({ code: 'timeout' });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
