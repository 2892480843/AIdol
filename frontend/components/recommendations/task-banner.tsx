'use client';

import styles from '@/components/shared/core-surfaces.module.css';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRecommendationTaskList } from '@/lib/recommendations/use-recommendation-tasks';
import { isTaskActive } from '@/lib/recommendations/types';

function AuthenticatedTaskBanner() {
  const t = useTranslations('suggest.tasks');
  const { tasks } = useRecommendationTaskList();
  const active = tasks.find(isTaskActive);
  if (!tasks.length) return null;
  return (
    <div className={`${styles.statusStrip} justify-between`}>
      <div className="flex items-start gap-3">
        {active ? <Loader2 className="h-5 w-5 text-primary mt-0.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-5 w-5 text-primary mt-0.5" aria-hidden="true" />}
        <div><p className="font-medium text-sm">{active ? t('status.running') : t('title')}</p><p className="text-xs text-muted-foreground mt-1">{t('dashboardHint')}</p></div>
      </div>
      <Button asChild variant="ghost" size="sm" className="gap-2 self-start sm:self-auto"><Link href="/dashboard/suggest">{t('openActivity')}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Button>
    </div>
  );
}

export function RecommendationTaskBanner() {
  const { data: session, status } = useSession();
  return status === 'authenticated' && session?.user.id ? <AuthenticatedTaskBanner key={session.user.id} /> : null;
}
