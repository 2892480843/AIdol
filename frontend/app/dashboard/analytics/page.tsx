'use client';

import { PageHeader } from '@/components/page-header';
import styles from '@/components/secondary-ui.module.css';

import {
  Shirt,
  Sparkles,
  TrendingUp,
  Activity,
  Lightbulb,
  PieChart,
  BarChart,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useAnalytics } from '@/lib/hooks/use-analytics';
import { AcceptanceTrendChart } from '@/components/acceptance-trend-chart';
import { useColorLabel, useTypeLabel } from '@/lib/hooks/use-translated-constants';
import { useAnalyticsInsightLines } from '@/lib/hooks/use-insight-text';
import { colorSwatch } from '@/lib/colors';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card className={styles.statCard}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-1">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <span className={styles.statIcon}><Icon className="h-5 w-5" /></span>
      </CardHeader>
      <CardContent>
        <div className="text-4xl font-semibold tracking-tight tabular-nums">{value}</div>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          {trend === 'up' && <TrendingUp className="h-3 w-3 text-green-500" />}
          {trend === 'down' && <TrendingUp className="h-3 w-3 text-red-500 rotate-180" />}
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className={styles.page}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ColorBar({ color, percentage }: { color: string; percentage: number }) {
  const t = useTranslations('analytics');
  const colorLabel = useColorLabel();

  return (
    <div className="flex items-center gap-3">
      <div className="w-4 h-4 rounded border" style={{ backgroundColor: colorSwatch(color) }} />
      <div className="flex-1">
        <div className="flex justify-between text-sm mb-1">
          <span>{colorLabel(color)}</span>
          <span className="text-muted-foreground">{t('percent', { value: percentage.toFixed(1) })}</span>
        </div>
        <Progress value={percentage} className="h-2" />
      </div>
    </div>
  );
}

function ItemCard({ item }: { item: { id: string; name: string | null; type: string; thumbnail_url: string | null; wear_count: number } }) {
  const typeLabel = useTypeLabel();
  const t = useTranslations('analytics');
  return (
    <Link
      href={`/dashboard/wardrobe?item=${item.id}`}
      className="flex items-center gap-3 rounded-none p-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded-none bg-muted">
        {item.thumbnail_url ? (
          <Image
            src={item.thumbnail_url}
            alt={item.name || typeLabel(item.type)}
            fill
            className="object-cover"
            sizes="56px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Shirt className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{item.name || typeLabel(item.type)}</p>
        <p className="text-sm text-muted-foreground capitalize">{typeLabel(item.type)}</p>
      </div>
      <Badge variant="secondary">{t('wearCount', { count: item.wear_count })}</Badge>
    </Link>
  );
}

export default function AnalyticsPage() {
  const typeLabel = useTypeLabel();
  const colorLabel = useColorLabel();
  const t = useTranslations('analytics');
  const { data, isLoading, isError } = useAnalytics(60);
  const insights = useAnalyticsInsightLines(data);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <PageHeader title={t('title')} description={t('subtitle')} icon={<BarChart className="h-5 w-5" />} />
        <LoadingSkeleton />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div role="alert" className="surface-panel p-8 text-center text-destructive">
        {t('loadError')}
      </div>
    );
  }

  const { wardrobe, color_distribution, type_distribution, most_worn, least_worn, never_worn, acceptance_trend } = data;

  return (
    <div className={styles.page}>
      <PageHeader title={t('title')} description={t('subtitle')} icon={<BarChart className="h-5 w-5" />} />

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t('stats.totalItems.title')}
          value={wardrobe.total_items}
          description={t('stats.totalItems.description', { count: wardrobe.items_by_status.ready })}
          icon={Shirt}
        />
        <StatCard
          title={t('stats.outfitsGenerated.title')}
          value={wardrobe.total_outfits}
          description={t('stats.outfitsGenerated.description', { count: wardrobe.outfits_this_week })}
          icon={Sparkles}
        />
        <StatCard
          title={t('stats.acceptanceRate.title')}
          value={wardrobe.acceptance_rate != null ? t('percent', { value: wardrobe.acceptance_rate }) : '-'}
          description={wardrobe.acceptance_rate != null ? t('stats.acceptanceRate.description') : t('stats.totalWears.noData')}
          icon={TrendingUp}
          trend={wardrobe.acceptance_rate != null && wardrobe.acceptance_rate > 50 ? 'up' : undefined}
        />
        <StatCard
          title={t('stats.totalWears.title')}
          value={wardrobe.total_wears}
          description={wardrobe.average_rating != null ? t('stats.avgRating', { rating: wardrobe.average_rating }) : t('stats.totalWears.description')}
          icon={Activity}
        />
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              {t('insights.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {insights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <div className="h-1.5 w-1.5 rounded-none bg-primary mt-2 flex-shrink-0" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Color Distribution */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              {t('insights.colorDistribution.title')}
            </CardTitle>
            <CardDescription>{t('insights.colorDistribution.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {color_distribution.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('insights.colorDistribution.noData')}</p>
            ) : (
              <div className={styles.donutLayout}>
                <svg viewBox="0 0 120 120" className={styles.donut} role="img" aria-label={t('insights.colorDistribution.title')}>
                  <circle cx="60" cy="60" r="46" fill="none" stroke="hsl(var(--muted))" strokeWidth="16" />
                  {color_distribution.map((color, index) => (
                    <circle key={color.color} cx="60" cy="60" r="46" pathLength="100" fill="none" stroke={colorSwatch(color.color)} strokeWidth="16"
                      strokeDasharray={`${color.percentage} ${100 - color.percentage}`}
                      strokeDashoffset={-color_distribution.slice(0, index).reduce((total, previous) => total + previous.percentage, 0)}
                      transform="rotate(-90 60 60)">
                      <title>{colorLabel(color.color)}: {t('percent', { value: color.percentage.toFixed(1) })}</title>
                    </circle>
                  ))}
                  <text x="60" y="61" textAnchor="middle" fill="currentColor" fontSize="22" fontWeight="600">{wardrobe.total_items}</text>
                  <text x="60" y="76" textAnchor="middle" fill="currentColor" fontSize="8" opacity=".55">{t('stats.totalItems.title')}</text>
                </svg>
                <div className="space-y-3">
                {color_distribution.slice(0, 8).map((color) => (
                  <ColorBar key={color.color} color={color.color} percentage={color.percentage} />
                ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Type Distribution */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart className="h-5 w-5" />
              {t('insights.itemTypes.title')}
            </CardTitle>
            <CardDescription>{t('insights.itemTypes.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {type_distribution.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('insights.itemTypes.noData')}</p>
            ) : (
              <div className="space-y-3">
                {type_distribution.map((type) => (
                  <div key={type.type} className="space-y-2">
                    <span className="capitalize">{typeLabel(type.type)}</span>
                    <div className="flex items-center gap-3">
                      <Progress value={type.percentage} className="h-2.5 flex-1" />
                      <span className="text-sm text-muted-foreground w-12 text-right">
                        {type.count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Most Worn */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('insights.mostWorn.title')}</CardTitle>
            <CardDescription>{t('insights.mostWorn.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {most_worn.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('insights.mostWorn.noData')}</p>
            ) : (
              <div className="space-y-1">
                {most_worn.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Least Worn */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('insights.leastWorn.title')}</CardTitle>
            <CardDescription>{t('insights.leastWorn.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {least_worn.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('insights.leastWorn.noData')}</p>
            ) : (
              <div className="space-y-1">
                {least_worn.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Never Worn */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('insights.neverWorn.title')}</CardTitle>
            <CardDescription>{t('insights.neverWorn.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {never_worn.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('insights.neverWorn.noData')}</p>
            ) : (
              <div className="space-y-1">
                {never_worn.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Acceptance Trend */}
      {acceptance_trend.length > 0 && acceptance_trend.some((t) => t.total > 0) && (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('insights.acceptanceTrend.title')}</CardTitle>
            <CardDescription>{t('insights.acceptanceTrend.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <AcceptanceTrendChart data={acceptance_trend} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
