'use client';

import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { Alert } from '@mantine/core';
import { useTranslations } from 'next-intl';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);
  const t = useTranslations('common');

  useEffect(() => {
    // Check initial state
    setIsOffline(!navigator.onLine);

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="offline-status">
      <Alert role="status" icon={<WifiOff className="h-4 w-4" />} color="forest" variant="filled" radius="xl">
        {t('youreOffline')}
      </Alert>
    </div>
  );
}
