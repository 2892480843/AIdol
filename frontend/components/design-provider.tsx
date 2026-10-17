'use client';

import { MantineProvider } from '@mantine/core';
import { useTheme } from 'next-themes';
import { wardrobeTheme } from '@/lib/design-system';

export function DesignProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  return (
    <MantineProvider
      theme={wardrobeTheme}
      defaultColorScheme="auto"
      forceColorScheme={
        resolvedTheme === 'dark'
          ? 'dark'
          : resolvedTheme === 'light'
            ? 'light'
            : undefined
      }
    >
      {children}
    </MantineProvider>
  );
}
