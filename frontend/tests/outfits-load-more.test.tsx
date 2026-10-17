import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OutfitsPage from '@/app/dashboard/outfits/page'
import { api, setActiveSession } from '@/lib/api'
import { queryKeys } from '@/lib/hooks/query-keys'
import { useBulkDeleteOutfits } from '@/lib/hooks/use-outfits'

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/dashboard/outfits',
  useSearchParams: () => nav.params,
}))
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'outfit-test-owner' }, accessToken: 'outfit-test-token' }, status: 'authenticated' }),
}))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  api: { get: vi.fn(), post: vi.fn() },
  setAccessToken: vi.fn(),
}))
vi.mock('@/components/outfits/outfit-card', () => ({
  OutfitCard: ({ outfit }: { outfit: { id: string } }) => <div>{outfit.id}</div>,
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['user-profile'], { timezone: 'UTC' })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => setActiveSession('outfit-test-owner', 'outfit-test-token'))
afterEach(() => {
  setActiveSession(null, null)
  vi.mocked(api.get).mockReset()
  vi.mocked(api.post).mockReset()
  nav.params = new URLSearchParams()
})

describe('outfits load more', () => {
  it('keeps the first page and appends the second', async () => {
    vi.mocked(api.get).mockImplementation(async (_path, options) => {
      const params = (options as { params: Record<string, string> }).params
      const page = Number(params.page)
      if (params.is_lookbook) {
        return { outfits: [], total: 1, page: 1, page_size: 1, has_more: false }
      }
      return {
        outfits: [{ id: `outfit-page-${page}` }],
        total: 2,
        page,
        page_size: 1,
        has_more: page === 1,
      }
    })

    render(<OutfitsPage />, { wrapper })

    expect(await screen.findByText('outfit-page-1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'loadMore' }))

    expect(await screen.findByText('outfit-page-2')).toBeInTheDocument()
    expect(screen.getByText('outfit-page-1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'loadMore' })).not.toBeInTheDocument()
  })
})

describe('bulk outfit delete', () => {
  it('removes the deleted outfits from every loaded page of the infinite list', async () => {
    vi.mocked(api.post).mockResolvedValue({ deleted: 1 })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const key = queryKeys.outfits.infinite({}, 1)
    client.setQueryData(key, {
      pages: [
        { outfits: [{ id: 'a' }], total: 2, page: 1, page_size: 1, has_more: true },
        { outfits: [{ id: 'b' }], total: 2, page: 2, page_size: 1, has_more: false },
      ],
      pageParams: [1, 2],
    })
    const { result } = renderHook(useBulkDeleteOutfits, {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    })

    await act(() => result.current.mutateAsync({ outfit_ids: ['b'] }))

    const data = client.getQueryData<{ pages: { outfits: { id: string }[]; total: number }[] }>(key)
    expect(data?.pages.map((page) => page.outfits.map((outfit) => outfit.id))).toEqual([['a'], []])
    expect(data?.pages[0].total).toBe(1)
  })
})

describe('outfit search', () => {
  it('includes a manually worn pending outfit and excludes an accepted but unworn outfit', async () => {
    nav.params = new URLSearchParams('filter=worn')
    const outfits = [
      { id: 'manual-worn-pending', status: 'pending', feedback: { worn_at: '2026-10-17T08:00:00Z' } },
      { id: 'accepted-unworn', status: 'accepted', feedback: null },
    ]
    vi.mocked(api.get).mockImplementation(async (_path, options) => {
      const params = (options as { params: Record<string, string> }).params
      const matches = params.is_lookbook === 'true' ? [] : outfits.filter((outfit) =>
        (!params.status || outfit.status === params.status) && (params.worn !== 'true' || !!outfit.feedback?.worn_at),
      )
      return { outfits: matches, total: matches.length, page: 1, page_size: 20, has_more: false }
    })
    render(<OutfitsPage />, { wrapper })
    expect(await screen.findByText('manual-worn-pending')).toBeInTheDocument()
    expect(screen.queryByText('accepted-unworn')).not.toBeInTheDocument()
  })

  it('keeps the calendar on the same worn scope without an accepted status restriction', async () => {
    nav.params = new URLSearchParams('filter=worn&view=calendar&month=2026-10')
    vi.mocked(api.get).mockResolvedValue({ outfits: [], total: 0, page: 1, page_size: 100, has_more: false })
    render(<OutfitsPage />, { wrapper })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/outfits', {
      params: expect.objectContaining({ worn: 'true', is_lookbook: 'false', date_from: '2026-10-01', date_to: '2026-10-31' }),
    }))
    const calendar = vi.mocked(api.get).mock.calls.find(([, options]) =>
      (options as { params?: Record<string, string> })?.params?.date_from === '2026-10-01',
    )
    expect((calendar?.[1] as { params: Record<string, string> }).params).not.toHaveProperty('status')
  })

  it('passes the worn filter through select-all deletion after the real confirmation', async () => {
    nav.params = new URLSearchParams('filter=worn')
    vi.mocked(api.get).mockImplementation(async (_path, options) => {
      const params = (options as { params: Record<string, string> }).params
      return { outfits: params.is_lookbook === 'true' ? [] : [{ id: 'manual-worn-pending' }], total: 2, page: 1, page_size: 1, has_more: false }
    })
    vi.mocked(api.post).mockResolvedValue({ deleted: 2, failed: 0, errors: [] })
    render(<OutfitsPage />, { wrapper })
    await screen.findByText('manual-worn-pending')
    fireEvent.click(screen.getByRole('button', { name: 'bulkActions.select' }))
    fireEvent.click(screen.getByRole('button', { name: 'selectAll' }))
    fireEvent.click(screen.getByRole('button', { name: 'bulkActions.selectAllMatching' }))
    fireEvent.click(screen.getByRole('button', { name: 'delete' }))
    const confirmation = await screen.findByRole('alertdialog')
    fireEvent.click(within(confirmation).getByRole('button', { name: 'delete' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/outfits/bulk/delete', {
      select_all: true, excluded_ids: [], filters: { is_lookbook: false, worn: true },
    }, expect.anything()))
  })

  it('keeps a lookbook wear-history link scoped to its original outfit', async () => {
    nav.params = new URLSearchParams('filter=worn&cloned_from=template-1')
    vi.mocked(api.get).mockResolvedValue({ outfits: [], total: 0, page: 1, page_size: 1, has_more: false })
    render(<OutfitsPage />, { wrapper })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/outfits', {
      params: expect.objectContaining({ cloned_from_outfit_id: 'template-1', is_lookbook: 'false', worn: 'true' }),
    }))
  })

  it('sends the occasions whose label contains the term alongside it', async () => {
    nav.params = new URLSearchParams('filter=my-looks')
    vi.mocked(api.get).mockResolvedValue({
      outfits: [],
      total: 0,
      page: 1,
      page_size: 1,
      has_more: false,
    })

    render(<OutfitsPage />, { wrapper })
    fireEvent.change(screen.getByPlaceholderText('search'), { target: { value: 'Lounge' } })

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/outfits', {
        params: expect.objectContaining({ search: 'Lounge', occasions: 'lounge' }),
      }),
    )
  })
})
