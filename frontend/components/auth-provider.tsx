'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { setActiveSession } from '@/lib/api';

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { data: session, status } = useSession();
  const ownerId = status === 'authenticated' ? session?.user.id ?? null : null;
  const token = status === 'authenticated' ? session?.accessToken ?? null : null;
  const [synchronizedOwner, setSynchronizedOwner] = useState<string | null | undefined>();

  useEffect(() => {
    setActiveSession(ownerId, token);
    setSynchronizedOwner(ownerId);
  }, [ownerId, token]);

  // Mount the new account only after its credentials are installed. The gate also
  // unmounts the previous account immediately, without changing globals during render
  // or sharing authentication state between server-rendered requests.
  return synchronizedOwner === ownerId ? <>{children}</> : null;
}
