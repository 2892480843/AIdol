'use client';

import { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AcceptanceRateTrend } from '@/lib/hooks/use-analytics';
import { formatDate } from '@/lib/utils';
import styles from '@/components/secondary-ui.module.css';

const PERIOD_OPTIONS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

export function AcceptanceTrendChart({ data }: { data: AcceptanceRateTrend[] }) {
  const t = useTranslations('analytics');
  const locale = useLocale();
  const gradientId = useId();
  const width = 760;
  const height = 220;
  const left = 8;
  const top = 18;
  const baseline = height - 24;
  const plotHeight = baseline - top;
  const x = (index: number) => left + (index / Math.max(data.length - 1, 1)) * (width - left - 20);
  const y = (rate: number) => baseline - (Math.min(100, Math.max(0, rate)) / 100) * plotHeight;
  const hasResponses = (week: AcceptanceRateTrend) => week.accepted + week.rejected > 0;
  // Pending suggestions have no observed acceptance rate; leave a gap in the curve.
  const segments: { index: number; week: AcceptanceRateTrend }[][] = [];
  data.forEach((week, index) => {
    if (!hasResponses(week)) return;
    if (index === 0 || !hasResponses(data[index - 1])) segments.push([]);
    segments[segments.length - 1].push({ index, week });
  });

  return (
    <figure className={styles.chart}>
      <div className={styles.chartPlot}>
      <div className={styles.chartAxis} aria-hidden="true">{[100, 75, 50, 25, 0].map((rate) => <span key={rate}>{t('percent', { value: rate })}</span>)}</div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={t('insights.acceptanceTrend.title')}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".18" />
            <stop offset="100%" stopColor="currentColor" stopOpacity=".015" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((rate) => (
          <g key={rate}>
            <line x1={left} x2={width - 20} y1={y(rate)} y2={y(rate)} stroke="currentColor" strokeOpacity=".1" strokeDasharray="3 5" />
          </g>
        ))}
        {segments.map((segment) => {
          const points = segment.map(({ index, week }) => `${x(index)},${y(week.rate)}`).join(' ');
          return (
            <g key={segment[0].week.period_start}>
              {segment.length > 1 && <polygon points={`${x(segment[0].index)},${baseline} ${points} ${x(segment[segment.length - 1].index)},${baseline}`} fill={`url(#${gradientId})`} />}
              <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {segment.map(({ index, week }) => (
                <circle key={week.period_start} data-rate={week.rate} cx={x(index)} cy={y(week.rate)} r="4.5" fill="currentColor" stroke="hsl(var(--card))" strokeWidth="2">
                  <title>{formatDate(week.period_start, locale, PERIOD_OPTIONS)}: {t('percent', { value: week.rate.toFixed(0) })} ({week.accepted}/{week.accepted + week.rejected})</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      </div>
      <figcaption className={styles.chartLabels}>
        {data.map((week) => (
          <div key={week.period_start}>
            <span>{formatDate(week.period_start, locale, PERIOD_OPTIONS)}</span>
            <strong className="font-medium text-foreground">{hasResponses(week) ? t('percent', { value: week.rate.toFixed(0) }) : '—'}</strong>
          </div>
        ))}
      </figcaption>
    </figure>
  );
}
