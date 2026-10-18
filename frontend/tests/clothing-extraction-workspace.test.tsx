import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveSession } from '@/lib/api';
import { ClothingExtractionWorkspace } from '@/components/clothing-extraction/workspace';
vi.mock('@/lib/hooks/use-translated-constants', () => ({ useTypeLabel: () => (type: string) => type }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: Record<string, unknown>) => key + (values?.name ? ` ${values.name}` : values?.count !== undefined ? ` ${values.count}` : '') }));
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const ok = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const caps = (available = true) => ({ available, model: 'schp-atr18-int8', max_bytes: 8000000, max_pixels: 20000000 });
const extraction = { model: 'schp-atr18-int8', image_width: 400, image_height: 800, warnings: [], pieces: ['top', 'pants'].map(type => ({ id: type, type, category: type === 'top' ? 'top' : 'bottom', confidence: .9, bbox: { x: 0, y: 0, width: 1, height: 1 }, thumbnail_data_url: png })) };
let client: QueryClient, fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  setActiveSession('owner-a', 'token-a');
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  fetchMock = vi.fn().mockResolvedValueOnce(ok(caps())); vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:outfit-preview'); URL.revokeObjectURL = vi.fn();
});
afterEach(() => { client.clear(); act(() => setActiveSession(null, null)); vi.unstubAllGlobals(); });
function open() { return render(<QueryClientProvider client={client}><ClothingExtractionWorkspace /></QueryClientProvider>); }
async function upload() {
  await waitFor(() => expect(screen.getByLabelText('choosePhoto')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('choosePhoto'), { target: { files: [new File(['photo'], 'look.jpg', { type: 'image/jpeg' })] } });
}
describe('review before writing to the wardrobe', () => {
  it('shows an empty real-photo flow, extracts only on click, allows edits and saves only selected pieces', async () => {
    open(); await upload();
    expect(screen.getByAltText('sourceAlt')).toHaveAttribute('src', 'blob:outfit-preview');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /^saveSelected/ })).not.toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(ok(extraction));
    fireEvent.click(screen.getByRole('button', { name: 'extract' }));
    await waitFor(() => expect(screen.getAllByRole('group', { name: /^pieceLabel/ })).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const cards = screen.getAllByRole('group', { name: /^pieceLabel/ });
    expect(within(cards[0]).getByRole('img')).toHaveAttribute('src', png);
    fireEvent.change(within(cards[0]).getByLabelText('nameLabel'), { target: { value: 'A reviewed name' } });
    fireEvent.change(within(cards[0]).getByLabelText('typeLabel'), { target: { value: 'dress' } });
    fireEvent.click(within(cards[1]).getByRole('checkbox'));
    fetchMock.mockResolvedValueOnce(ok({ id: 'saved-top', user_id: 'owner-a' }, 201));
    fireEvent.click(screen.getByRole('button', { name: 'saveSelected 1' }));
    await waitFor(() => expect(within(cards[0]).getByText('saved')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].body.get('name')).toBe('A reviewed name');
    expect(fetchMock.mock.calls[2][1].body.get('type')).toBe('dress');
    expect(screen.getByRole('button', { name: 'saveSelected 0' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'viewWardrobe' })).toHaveAttribute('href', '/dashboard/wardrobe');
  });
  it('keeps the unavailable service explicit and sends no extraction request', async () => {
    fetchMock.mockReset().mockResolvedValue(ok(caps(false)));
    open(); await waitFor(() => expect(screen.getByText('serviceUnavailable')).toBeInTheDocument());
    expect(screen.getByLabelText('choosePhoto')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'extract' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'retryService' })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('removes the previous account photo and candidates during account switching', async () => {
    open(); await upload();
    fetchMock.mockResolvedValueOnce(ok(extraction));
    fireEvent.click(screen.getByRole('button', { name: 'extract' }));
    await waitFor(() => expect(screen.getAllByRole('group', { name: /^pieceLabel/ })).toHaveLength(2));
    fetchMock.mockResolvedValueOnce(ok(caps()));
    act(() => setActiveSession('owner-b', 'token-b'));
    expect(screen.queryByAltText('sourceAlt')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('group', { name: /^pieceLabel/ })).toHaveLength(0);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/v1/items')).toBe(false);
  });
});
