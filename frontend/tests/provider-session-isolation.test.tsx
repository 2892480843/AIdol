import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { getAccessToken, getActiveUserId, setActiveSession } from '@/lib/api';
import { queryKeys } from '@/lib/hooks/query-keys';

const account = vi.hoisted(() => ({ id: 'user-a', token: 'token-a', status: 'authenticated' }));
vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => ({ data: account.status === 'authenticated' ? { user: { id: account.id }, accessToken: account.token } : null, status: account.status }),
}));
vi.mock('@/components/theme-provider', () => ({ ThemeProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/profile-locale-sync', () => ({ ProfileLocaleSync: () => null }));
vi.mock('sonner', () => ({ Toaster: () => null, toast: { error: vi.fn() } }));

const listKey = queryKeys.items.list({}, 1, 20);
beforeEach(() => {
  account.id = 'user-a';
  account.token = 'token-a';
  account.status = 'authenticated';
  setActiveSession(null, null);
});

describe('provider account boundary', () => {
  it('replaces shared wardrobe caches and local editor state before rendering another account', async () => {
    const clients: QueryClient[] = [];
    function Wardrobe() {
      const client = useQueryClient();
      if (!clients.includes(client)) clients.push(client);
      const owner = account.id;
      const { data } = useQuery({ queryKey: listKey, queryFn: async () => `wardrobe-${owner}`, staleTime: Infinity });
      const [draft, setDraft] = React.useState('');
      return <><p>{data ?? 'Loading wardrobe'}</p><input aria-label="Editor draft" value={draft} onChange={(event) => setDraft(event.target.value)} /></>;
    }
    const view = render(<Providers><Wardrobe /></Providers>);
    await screen.findByText('wardrobe-user-a');
    fireEvent.change(screen.getByLabelText('Editor draft'), { target: { value: 'private draft' } });
    account.id = 'user-b';
    account.token = 'token-b';
    view.rerender(<Providers><Wardrobe /></Providers>);
    expect(screen.queryByText('wardrobe-user-a')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Editor draft')).toHaveValue('');
    await screen.findByText('wardrobe-user-b');
    expect(clients).toHaveLength(2);
    expect(clients[0].getQueryData(listKey)).toBeUndefined();
    expect(getActiveUserId()).toBe('user-b');
    expect(getAccessToken()).toBe('token-b');
  });

  it('keeps late queries and mutation callbacks in the previous account client', async () => {
    let finishQuery!: (value: string) => void;
    let finishMutation!: (value: string) => void;
    let oldSignal: AbortSignal | undefined;
    function Wardrobe() {
      const client = useQueryClient();
      const owner = account.id;
      const { data } = useQuery({
        queryKey: listKey,
        queryFn: ({ signal }) => {
          if (owner === 'user-b') return Promise.resolve('wardrobe-user-b');
          oldSignal = signal;
          return new Promise<string>((resolve) => { finishQuery = resolve; });
        },
      });
      const mutation = useMutation({
        mutationFn: () => new Promise<string>((resolve) => { finishMutation = resolve; }),
        onSuccess: (value) => client.setQueryData(listKey, value),
      });
      return <><p>{data ?? 'Loading wardrobe'}</p><button onClick={() => mutation.mutate()}>Save old draft</button></>;
    }
    const view = render(<Providers><Wardrobe /></Providers>);
    await waitFor(() => expect(finishQuery).toBeTypeOf('function'));
    fireEvent.click(screen.getByText('Save old draft'));
    await waitFor(() => expect(finishMutation).toBeTypeOf('function'));
    account.id = 'user-b';
    account.token = 'token-b';
    view.rerender(<Providers><Wardrobe /></Providers>);
    await screen.findByText('wardrobe-user-b');
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => { finishQuery('late-private-query-a'); finishMutation('late-private-mutation-a'); });
    expect(screen.getByText('wardrobe-user-b')).toBeInTheDocument();
    expect(screen.queryByText(/late-private/)).not.toBeInTheDocument();
  });

  it('keeps the same user cache during token rotation and clears credentials immediately on logout', async () => {
    const fetchWardrobe = vi.fn(async () => 'same-user-wardrobe');
    function Wardrobe() {
      const { data } = useQuery({ queryKey: listKey, queryFn: fetchWardrobe, staleTime: Infinity });
      return <p>{data}</p>;
    }
    const view = render(<Providers><Wardrobe /></Providers>);
    await screen.findByText('same-user-wardrobe');
    account.token = 'rotated-token';
    view.rerender(<Providers><Wardrobe /></Providers>);
    expect(fetchWardrobe).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBe('rotated-token');
    account.status = 'unauthenticated';
    view.rerender(<Providers><p>Signed out</p></Providers>);
    expect(getAccessToken()).toBeNull();
    expect(getActiveUserId()).toBeNull();
  });
});
