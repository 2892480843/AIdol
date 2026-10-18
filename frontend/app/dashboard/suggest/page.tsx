'use client';

import styles from '@/components/shared/core-surfaces.module.css';

import { Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RecommendationWorkspace } from '@/components/recommendations/recommendation-workspace';

function SuggestContent() {
  const { data: session, status } = useSession();
  // Reset local form, feedback and result state at the account boundary as well as
  // isolating all recommendation queries by the authenticated backend user ID.
  return <RecommendationWorkspace key={status === 'authenticated' ? session?.user.id ?? 'anonymous' : status} />;
}

export default function SuggestPage() {
  return (
    <Suspense fallback={
      <div className={`page-container ${styles.page}`}>
        <div className="space-y-2"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-64" /></div>
        <Card><CardContent className="p-6 space-y-4"><Skeleton className="h-24 w-full rounded-none" /><Skeleton className="h-10 w-full" /></CardContent></Card>
      </div>
    }>
      <SuggestContent />
    </Suspense>
  );
}
