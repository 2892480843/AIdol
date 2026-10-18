import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { useWeather } from '@/lib/hooks/use-weather';
import { queryKeys } from '@/lib/hooks/query-keys';
import type { UserProfile } from '@/lib/hooks/use-user';

vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'authenticated', data: { accessToken: 'weather-test', user: { id: 'weather-owner' } } }) }));
vi.mock('@/lib/api', async (original) => ({ ...await original<typeof import('@/lib/api')>(), api: { get: vi.fn() } }));

const base = { id: 'weather-owner', display_name: 'Test', timezone: 'UTC', locale: 'en' } as UserProfile;
const snapshot = { temperature: 22, condition: 'sunny' };
function mount(profile: Partial<UserProfile> = {}, pendingProfile?: Promise<unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  vi.mocked(api.get).mockImplementation(async (path) => {
    if (path === '/users/me') return (pendingProfile ? await pendingProfile : { ...base, ...profile }) as never;
    if (path === '/weather/current') return snapshot as never;
    throw new Error('Unexpected request');
  });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(() => useWeather(), { wrapper }) };
}
const requests = () => vi.mocked(api.get).mock.calls.filter(([path]) => path === '/weather/current');

beforeEach(() => { vi.mocked(api.get).mockReset(); });

describe('weather location prerequisites', () => {
  it.each([{}, { location_name: '   ' }, { location_lat: 31 }, { location_lon: 121 }, { location_lat: Number.NaN, location_lon: 121 }])('does not request weather without a usable saved location: %j', async (location) => {
    const { result, unmount, client } = mount(location);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.locationRequired).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(requests()).toHaveLength(0);
    unmount(); client.clear();
  });

  it('waits for the profile before requesting weather', async () => {
    let complete!: (value: unknown) => void;
    const profile = new Promise(resolve => { complete = resolve; });
    const pending = mount({}, profile);
    expect(pending.result.current.isLoading).toBe(true);
    expect(requests()).toHaveLength(0);
    await act(async () => complete({ ...base, location_name: 'Shanghai' }));
    await waitFor(() => expect(pending.result.current.data).toEqual(snapshot));
    expect(requests()).toHaveLength(1);
    pending.unmount(); pending.client.clear();
  });

  it.each([{ location_lat: 0, location_lon: 0 }, { location_name: 'Shanghai' }])('fetches with coordinates including zero, or a city name: %j', async (location) => {
    const { result, unmount, client } = mount(location);
    await waitFor(() => expect(result.current.data).toEqual(snapshot));
    expect(result.current.locationRequired).toBe(false);
    expect(requests()).toHaveLength(1);
    unmount(); client.clear();
  });

  it('starts after setting a location, reloads after changing it, and hides old weather when cleared', async () => {
    const { result, unmount, client } = mount();
    await waitFor(() => expect(result.current.locationRequired).toBe(true));
    act(() => client.setQueryData(queryKeys.userProfile, { ...base, location_name: 'Shanghai' }));
    await waitFor(() => expect(result.current.data).toEqual(snapshot));
    act(() => client.setQueryData(queryKeys.userProfile, { ...base, location_name: 'Beijing' }));
    await waitFor(() => expect(requests()).toHaveLength(2));
    act(() => client.setQueryData(queryKeys.userProfile, base));
    await waitFor(() => expect(result.current.locationRequired).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(requests()).toHaveLength(2);
    unmount(); client.clear();
  });
});
