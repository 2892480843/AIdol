'use client';

import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, CheckCircle2, Clock3, History, Loader2, RefreshCw, Square, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useOccasionLabel } from '@/lib/hooks/use-translated-constants';
import { cn, formatShortDate } from '@/lib/utils';
import { isTaskActive, type RecommendationStatus, type RecommendationTask } from '@/lib/recommendations/types';

const STATUS_KEYS: Record<RecommendationStatus, string> = {
  queued: 'status.queued', running: 'status.running', succeeded: 'status.succeeded', failed: 'status.failed', cancelled: 'status.cancelled',
};
const STAGE_KEYS: Record<string, string> = {
  queued: 'stage.queued', preparing: 'stage.preparing', generating: 'stage.generating', completed: 'stage.completed', error: 'stage.error', cancelled: 'stage.cancelled',
};

export function TaskPanel({ tasks, activeTask, loading, busy, loadingResults, error, onOpen, onRetry, onCancel, onRefresh }: {
  tasks: RecommendationTask[];
  activeTask: RecommendationTask | null;
  loading: boolean;
  busy: boolean;
  loadingResults: boolean;
  error: string | null;
  onOpen: (task: RecommendationTask) => void;
  onRetry: (taskId: string) => void;
  onCancel: (taskId: string) => void;
  onRefresh: () => void;
}) {
  const t = useTranslations('suggest.tasks');
  const locale = useLocale();
  const occasionLabel = useOccasionLabel();
  if (!tasks.length && !activeTask && !loading && !error) return null;
  const history = tasks.filter((task) => task.id !== activeTask?.id);
  const active = activeTask && isTaskActive(activeTask);
  const Icon = active ? Loader2 : activeTask?.status === 'succeeded' ? CheckCircle2 : activeTask?.status === 'failed' ? AlertCircle : XCircle;

  return (
    <Card className={cn('overflow-hidden', active && 'border-primary/40')}>
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold flex items-center gap-2"><History className="h-4 w-4 text-primary" aria-hidden="true" />{t('title')}</h2>
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onRefresh} disabled={busy || loading}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />{t('refresh')}
          </Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {loading && <p role="status" className="text-sm text-muted-foreground">{t('loading')}</p>}
        {activeTask && (
          <div className="rounded-xl bg-muted/40 border p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', active && 'animate-spin text-primary', activeTask.status === 'failed' && 'text-destructive')} aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-1">
                <p role="status" aria-live="polite" className="font-medium text-sm">{t(STAGE_KEYS[activeTask.stage] ?? STATUS_KEYS[activeTask.status])}</p>
                <p className="text-xs text-muted-foreground">
                  {active ? t('backgroundHint') : activeTask.status === 'succeeded' ? t('completedHint') : activeTask.status === 'failed' ? t('failedHint') : t('cancelledHint')}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">{t(STATUS_KEYS[activeTask.status])}</Badge>
            </div>
            {activeTask.error && <p className="text-sm text-destructive break-words">{activeTask.error}</p>}
            {loadingResults && <p role="status" className="text-xs text-muted-foreground">{t('loadingResults')}</p>}
            {(active || activeTask.status === 'failed') && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <span className="text-xs text-muted-foreground">{t('attempt', { count: activeTask.attempts, max: activeTask.max_attempts })}</span>
                {active ? (
                  <Button type="button" size="sm" variant="outline" disabled={busy} className="gap-1.5" onClick={() => onCancel(activeTask.id)}><Square className="h-3 w-3" aria-hidden="true" />{t('cancel')}</Button>
                ) : (
                  <Button type="button" size="sm" disabled={busy} className="gap-1.5" onClick={() => onRetry(activeTask.id)}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />{t('retry')}</Button>
                )}
              </div>
            )}
          </div>
        )}
        {history.length > 0 && (
          <details className="group" open={!activeTask}>
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">{t('history', { count: history.length })}</summary>
            <div className="mt-3 divide-y max-h-72 overflow-y-auto">
              {history.map((task) => (
                <button type="button" key={task.id} onClick={() => onOpen(task)} className="flex w-full items-center justify-between gap-3 py-3 px-1 text-left hover:bg-muted/40 rounded-md disabled:opacity-60" disabled={busy}>
                  <span className="min-w-0 space-y-1">
                    <span className="block text-sm font-medium truncate">{occasionLabel(task.request.occasion ?? 'casual')}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" aria-hidden="true" />{formatShortDate(task.created_at, locale)}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0 text-xs"><Badge variant="outline">{t(STATUS_KEYS[task.status])}</Badge><span className="hidden sm:inline">{t('view')}</span></span>
                </button>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
