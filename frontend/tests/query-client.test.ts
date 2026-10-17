import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import type { QueryClient } from '@tanstack/react-query'
import { createQueryClient } from '@/lib/query-client'
import { ApiError } from '@/lib/api'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

type Meta = { toastsOwnErrors: boolean } | undefined

const failWith = (client: QueryClient, kind: 'mutation' | 'query', meta: Meta) => {
  const fail = () => Promise.reject(new ApiError('Validation error', 422, {}))
  if (kind === 'mutation') {
    return client.getMutationCache().build(client, { mutationFn: fail, meta }).execute(undefined)
  }
  return client.fetchQuery({ queryKey: ['failing'], queryFn: fail, meta })
}

describe('global error toast', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear()
  })

  it.each([
    { kind: 'mutation', meta: undefined, toasts: [['Validation error']] },
    { kind: 'mutation', meta: { toastsOwnErrors: true }, toasts: [] },
    { kind: 'query', meta: undefined, toasts: [['Validation error']] },
    { kind: 'query', meta: { toastsOwnErrors: true }, toasts: [] },
  ] as const)('$kind with meta $meta toasts $toasts', async ({ kind, meta, toasts }) => {
    const client = createQueryClient()

    await expect(failWith(client, kind, meta)).rejects.toThrow('Validation error')

    expect(vi.mocked(toast.error).mock.calls).toEqual(toasts)
  })
})

describe('quiet expected query errors', () => {
  beforeEach(() => vi.mocked(toast.error).mockClear())

  it.each([
    { status: 400, toasts: [] },
    { status: 404, toasts: [] },
    { status: 422, toasts: [['Expected empty-state error']] },
    { status: 503, toasts: [['Expected empty-state error', { duration: 8000 }]] },
  ])('only suppresses explicitly listed API status $status', async ({ status, toasts }) => {
    const client = createQueryClient()
    await expect(client.fetchQuery({
      queryKey: ['expected-empty-state', status],
      queryFn: () => Promise.reject(new ApiError('Expected empty-state error', status, {})),
      meta: { quietErrorStatuses: [400, 404] },
      retry: false,
    })).rejects.toThrow('Expected empty-state error')
    expect(vi.mocked(toast.error).mock.calls).toEqual(toasts)
    client.clear()
  })

  it('does not apply a query-only quiet status list to mutation failures', async () => {
    const client = createQueryClient()
    await expect(client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(new ApiError('Mutation failed', 400, {})),
      meta: { quietErrorStatuses: [400] },
    }).execute(undefined)).rejects.toThrow('Mutation failed')
    expect(toast.error).toHaveBeenCalledWith('Mutation failed')
    client.clear()
  })
})
