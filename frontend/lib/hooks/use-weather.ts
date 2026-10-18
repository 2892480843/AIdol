'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { api } from '@/lib/api';
import { useSetTokenIfAvailable } from '@/lib/hooks/use-session-token';
import type { CurrentWeather } from '@/lib/types';
import { queryKeys } from '@/lib/hooks/query-keys';
import { WEATHER_STALE_TIME } from '@/lib/hooks/query-timing';
import { useUserProfile } from '@/lib/hooks/use-user';

export function useWeather() {
  const { status } = useSession();
  useSetTokenIfAvailable();
  const profile = useUserProfile();
  const latitude = profile.data?.location_lat;
  const longitude = profile.data?.location_lon;
  const city = profile.data?.location_name?.trim() ?? '';
  const hasCoordinates = typeof latitude === 'number' && Number.isFinite(latitude)
    && latitude >= -90 && latitude <= 90
    && typeof longitude === 'number' && Number.isFinite(longitude)
    && longitude >= -180 && longitude <= 180;
  // The API geocodes a city only when both saved coordinates are absent.
  const hasLocation = hasCoordinates || (latitude == null && longitude == null && city.length > 0);

  const weather = useQuery({
    queryKey: [...queryKeys.weather, profile.data?.id ?? null, latitude ?? null, longitude ?? null, city],
    meta: { quietErrorStatuses: [400] },
    queryFn: () => hasLocation ? api.get<CurrentWeather>('/weather/current') : Promise.resolve(null),
    enabled: status !== 'loading' && profile.isSuccess && hasLocation,
    staleTime: WEATHER_STALE_TIME,
    retry: false, // Don't retry if location not set
  });

  return {
    ...weather,
    data: hasLocation ? weather.data ?? undefined : undefined,
    isLoading: status === 'loading' || profile.isLoading || weather.isLoading,
    error: profile.error ?? weather.error,
    isError: profile.isError || weather.isError,
    locationRequired: profile.isSuccess && !hasLocation,
  };
}
