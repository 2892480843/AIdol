'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/components/auth-provider';
import { ProfileLocaleSync } from '@/components/profile-locale-sync';
import { createQueryClient } from '@/lib/query-client';
import { DesignProvider } from '@/components/design-provider';

function AccountQueryScope({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  useEffect(() => () => {
    // A detached client's late mutation callbacks can only write into that client;
    // no account ever observes another account's cache or local component state.
    void queryClient.cancelQueries();
    queryClient.clear();
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ProfileLocaleSync />
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <DesignProvider>
          {children}
          <Toaster richColors position="top-center" toastOptions={{ className: 'design-toast' }} />
        </DesignProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function SessionQueryScope({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const identity = status === 'authenticated' ? `user:${session?.user.id ?? 'unknown'}` : status;
  return <AccountQueryScope key={identity}>{children}</AccountQueryScope>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthProvider>
        <SessionQueryScope>{children}</SessionQueryScope>
      </AuthProvider>
    </SessionProvider>
  );
}
