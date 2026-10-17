'use client';

import type { Session } from 'next-auth';
import { useSession } from 'next-auth/react';
import { setAccessToken } from '@/lib/api';

export function applySessionToken(session: Session | null | undefined) {
  if (session?.accessToken) {
    setAccessToken(session.accessToken, session.user.id);
  }
}

export function useSetTokenIfAvailable() {
  const { data: session } = useSession();
  applySessionToken(session);
}
