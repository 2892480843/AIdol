import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { ApiError, api } from '@/lib/api'
import { createQueryClient } from '@/lib/query-client'
import { useFamily } from '@/lib/hooks/use-family'
import { useWeather } from '@/lib/hooks/use-weather'
import { queryKeys } from '@/lib/hooks/query-keys'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api')>(),
  api: { get: vi.fn() },
}))

beforeEach(() => {
  vi.mocked(api.get).mockReset()
  vi.mocked(toast.error).mockClear()
})

describe('expected empty state queries', () => {
  it.each([
    { useHook: useFamily, key: queryKeys.family, path: '/families/me', status: 404 },
    { useHook: useWeather, key: queryKeys.weather, path: '/weather/current', status: 400 },
  ])('keeps $path error state without a raw global toast for $status', async ({ useHook, key, path, status }) => {
    const client = createQueryClient()
    vi.mocked(api.get).mockRejectedValue(new ApiError('Raw server empty state', status, {}))
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result, unmount } = renderHook(() => useHook(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(api.get).toHaveBeenCalledWith(path)
    expect(client.getQueryCache().find({ queryKey: key })?.meta).toEqual({ quietErrorStatuses: [status] })
    expect(toast.error).not.toHaveBeenCalled()
    unmount()
    client.clear()
  })
})
