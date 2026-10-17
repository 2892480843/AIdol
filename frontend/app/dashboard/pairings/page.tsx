'use client';

import { PageHeader } from '@/components/page-header';
import styles from '@/components/shared/core-surfaces.module.css';

import { useState } from 'react';
import { Sparkles, Layers } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePairings } from '@/lib/hooks/use-pairings';
import { useItemTypes } from '@/lib/hooks/use-items';
import { PairingCard } from '@/components/pairing-card';
import { FeedbackDialog } from '@/components/feedback-dialog';
import { OutfitPreviewDialog } from '@/components/outfit-preview-dialog';
import { Pairing } from '@/lib/types';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { useTypeLabel } from '@/lib/hooks/use-translated-constants';

function EmptyPairings({ t }: { t: (key: string) => string }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>
        <Layers className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{t('empty.title')}</h3>
      <p className="text-muted-foreground mb-6 max-w-sm">
        {t('empty.description')}
      </p>
      <Button variant="outline" asChild>
        <a href="/dashboard/wardrobe">{t('empty.goToWardrobe')}</a>
      </Button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className={styles.collection}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-5" />
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted mb-3">
              <Skeleton className="w-12 h-12 rounded-md" />
              <div className="flex-1">
                <Skeleton className="h-4 w-20 mb-1" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <div className="flex gap-2">
              {[1, 2, 3].map((j) => (
                <Skeleton key={j} className="w-14 h-14 rounded" />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function PairingsPage() {
  const t = useTranslations('pairings');
  const tc = useTranslations('common');
  const typeLabel = useTypeLabel();
  const [sourceType, setSourceType] = useState<string | undefined>(undefined);
  const [feedbackOutfit, setFeedbackOutfit] = useState<Pairing | null>(null);
  const [previewOutfit, setPreviewOutfit] = useState<Pairing | null>(null);

  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    usePairings(DEFAULT_PAGE_SIZE, sourceType);
  const pairings = data?.pages.flatMap((page) => page.pairings) ?? [];
  const total = data?.pages[0]?.total;
  const { data: itemTypes } = useItemTypes();

  const handleSourceTypeChange = (value: string) => {
    setSourceType(value === 'all' ? undefined : value);
  };

  if (isError) {
    return (
      <div className={`${styles.empty} text-destructive`} role="alert">
        {t('loadError')}
      </div>
    );
  }

  return (
    <div className={`page-container ${styles.page}`}>
      <PageHeader title={t('title')} description={t('subtitle')} icon={<Sparkles className="h-5 w-5" />} />

      {/* Filters */}
      <div className={`${styles.toolbar} ${styles.toolbarRow}`}>
        <Select value={sourceType || 'all'} onValueChange={handleSourceTypeChange}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder={t('allItemTypes')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allItemTypes')}</SelectItem>
            {itemTypes?.map((type) => (
              <SelectItem key={type.type} value={type.type}>
                {t('itemTypeOption', { type: typeLabel(type.type), count: type.count })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {total !== undefined && (
          <p className="text-sm text-muted-foreground">
            {t('pairingCount', { count: total })}
          </p>
        )}
      </div>

      {/* Pairings grid */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : pairings.length === 0 ? (
        <EmptyPairings t={t} />
      ) : (
        <>
          <div className={styles.collection}>
            {pairings.map((pairing) => (
              <PairingCard
                key={pairing.id}
                pairing={pairing}
                onFeedback={() => setFeedbackOutfit(pairing)}
                onPreview={() => setPreviewOutfit(pairing)}
              />
            ))}
          </div>

          {/* Pagination */}
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {tc('loadMore')}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Feedback dialog */}
      {feedbackOutfit && (
        <FeedbackDialog
          outfit={feedbackOutfit}
          open={!!feedbackOutfit}
          onClose={() => setFeedbackOutfit(null)}
        />
      )}

      {/* Preview dialog */}
      {previewOutfit && (
        <OutfitPreviewDialog
          outfit={previewOutfit}
          open={!!previewOutfit}
          onClose={() => setPreviewOutfit(null)}
        />
      )}
    </div>
  );
}
