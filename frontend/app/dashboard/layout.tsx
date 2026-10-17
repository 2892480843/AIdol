'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@mantine/core';
import { useTranslations } from 'next-intl';
import { Sidebar } from '@/components/sidebar';
import { MobileSidebar } from '@/components/mobile-sidebar';
import { MobileNav } from '@/components/mobile-nav';
import { Header } from '@/components/header';
import { OfflineIndicator } from '@/components/offline-indicator';
import { UploadQueueIndicator } from '@/components/upload-queue-indicator';
import { ImageLightbox } from '@/components/image-lightbox';
import { LightboxProvider } from '@/lib/lightbox-context';
import { useAuth } from '@/lib/hooks/use-auth';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const t = useTranslations('dashboard');

  const { user, isAuthenticated, isLoading, error } = useAuth();

  useEffect(() => {
    // If auth check completed and user is not authenticated, redirect to login
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  // Check onboarding status from API user
  useEffect(() => {
    if (user && user.onboarding_completed === false) {
      router.push('/onboarding');
    }
  }, [user, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <Skeleton height={48} width={48} radius="lg" />
          <p className="text-sm text-muted-foreground">{t('layout.loading')}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <LightboxProvider>
      <div className="app-shell">
        <a href="#main-content" className="skip-navigation">{t('layout.skipToContent')}</a>
        <Sidebar />
        <MobileSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="app-workspace">
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <main id="main-content" className="app-main">
            {children}
          </main>
        </div>
        <MobileNav />
        <OfflineIndicator />
        <UploadQueueIndicator />
        <ImageLightbox />
      </div>
    </LightboxProvider>
  );
}
