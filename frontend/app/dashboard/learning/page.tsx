'use client';

import { UnstyledButton } from '@mantine/core';

import { PageHeader } from '@/components/page-header';
import styles from '@/components/secondary-ui.module.css';

import {
  Brain,
  Lightbulb,
  TrendingUp,
  Activity,
  Sparkles,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Shirt,
  X,
  Heart,
  Cloud,
  Calendar,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  useLearning,
  useRecomputeLearning,
  useGenerateInsights,
  useAcknowledgeInsight,
  type ItemPair,
  type StyleInsight,
  type LearnedColorScore,
} from '@/lib/hooks/use-learning';
import { useColorLabel, useOccasionLabel, useStyleLabel } from '@/lib/hooks/use-translated-constants';
import { useInsightCategoryLabel, useLearningInsightText } from '@/lib/hooks/use-insight-text';
import { colorSwatch } from '@/lib/colors';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate } from '@/lib/utils';
import { useUserTimezone } from '@/lib/hooks/use-user';
import { RATING_MAX } from '@/lib/generated/scales';

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

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
};

const INTERPRETATION_KEYS: Record<string, string> = {
  stronglyLiked: 'interpretationStronglyLiked',
  liked: 'interpretationLiked',
  neutral: 'interpretationNeutral',
  disliked: 'interpretationDisliked',
  stronglyDisliked: 'interpretationStronglyDisliked',
};

const WEATHER_TYPE_KEYS: Record<string, string> = {
  cold: 'weatherTypeCold',
  cool: 'weatherTypeCool',
  mild: 'weatherTypeMild',
  hot: 'weatherTypeHot',
};

function ColorPreferenceBar({ colorScore }: { colorScore: LearnedColorScore }) {
  const t = useTranslations('learning');
  const colorLabel = useColorLabel();
  const interpretationKey = colorScore.interpretation_key
    ? INTERPRETATION_KEYS[colorScore.interpretation_key]
    : undefined;
  const score = colorScore.score;
  const percentage = Math.abs(score) * 100;
  const isPositive = score >= 0;

  return (
    <div className="flex items-center gap-3">
      <div className="w-4 h-4 rounded border" style={{ backgroundColor: colorSwatch(colorScore.color) }} />
      <div className="flex-1">
        <div className="flex justify-between text-sm mb-1">
          <span>{colorLabel(colorScore.color)}</span>
          <span className="text-muted-foreground flex items-center gap-1">
            {isPositive ? (
              <ThumbsUp className="h-3 w-3 text-green-500" />
            ) : (
              <ThumbsDown className="h-3 w-3 text-red-500" />
            )}
            {interpretationKey ? t(interpretationKey) : colorScore.interpretation}
          </span>
        </div>
        <div className="h-2 bg-muted rounded overflow-hidden">
          <div
            className={`h-full rounded ${isPositive ? 'bg-green-500' : 'bg-red-500'}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ItemPairCard({ pair }: { pair: ItemPair }) {
  const t = useTranslations('learning');
  const successRate = pair.times_paired > 0
    ? Math.round((pair.times_accepted / pair.times_paired) * 100)
    : 0;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-none border border-border/70 bg-muted/30 p-4">
      <div className="flex items-center gap-2 flex-1">
        {/* Item 1 */}
        <Link
          href={`/dashboard/wardrobe?item=${pair.item1.id}`}
          className="w-16 h-20 rounded-none bg-background overflow-hidden relative flex-shrink-0 hover:ring-2 ring-primary transition-all"
        >
          {pair.item1.thumbnail_url ? (
            <Image
              src={pair.item1.thumbnail_url}
              alt={pair.item1.name || pair.item1.type}
              fill
              className="object-cover"
              sizes="64px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Shirt className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </Link>

        {/* Plus sign */}
        <div className="text-muted-foreground text-lg">+</div>

        {/* Item 2 */}
        <Link
          href={`/dashboard/wardrobe?item=${pair.item2.id}`}
          className="w-16 h-20 rounded-none bg-background overflow-hidden relative flex-shrink-0 hover:ring-2 ring-primary transition-all"
        >
          {pair.item2.thumbnail_url ? (
            <Image
              src={pair.item2.thumbnail_url}
              alt={pair.item2.name || pair.item2.type}
              fill
              className="object-cover"
              sizes="64px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Shirt className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </Link>
      </div>

      <div className="text-right">
        <div className="flex items-center gap-1 justify-end">
          <Heart className="h-4 w-4 text-red-500" />
          <span className="font-medium">{t('percent', { value: successRate })}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {t('timesPaired', { count: pair.times_paired })}
        </div>
      </div>
    </div>
  );
}

function InsightCard({
  insight,
  onAcknowledge
}: {
  insight: StyleInsight;
  onAcknowledge: (id: string) => void;
}) {
  const t = useTranslations('learning');
  const insightText = useLearningInsightText();
  const categoryLabel = useInsightCategoryLabel();
  // Insights stored before message keys existed have none; their English text shows.
  const message = insight.message_key
    ? insightText({ key: insight.message_key, params: insight.message_params ?? {} })
    : null;
  const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    color: Sparkles,
    style: Heart,
    overall: Activity,
    weather: Cloud,
    occasion: Calendar,
  };

  const typeColors: Record<string, string> = {
    positive: 'border-primary/15 bg-primary/5',
    negative: 'border-amber-500/20 bg-amber-500/5',
    suggestion: 'border-primary/15 bg-primary/5',
    pattern: 'border-border bg-muted/30',
  };

  const Icon = categoryIcons[insight.category] || Lightbulb;
  const borderColor = typeColors[insight.insight_type] || 'border-muted';

  return (
    <div className={`relative rounded-none border p-5 ${borderColor}`}>
      <UnstyledButton
        onClick={() => onAcknowledge(insight.id)}
        type="button" aria-label={t('dismiss')} className="absolute right-3 top-3 rounded-none p-2 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        title={t('dismiss')}
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </UnstyledButton>
      <div className="flex items-start gap-3 pr-6">
        <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-medium">{message?.title ?? insight.title}</h4>
          <p className="text-sm text-muted-foreground mt-1">{message?.description ?? insight.description}</p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-xs">
              {categoryLabel(insight.category)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {t('confidence', { percent: Math.round(insight.confidence * 100) })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function NoLearningData({ onRecompute, isRefreshing }: { onRecompute: () => void; isRefreshing: boolean }) {
  const t = useTranslations('learning');
  return (
    <Card className="col-span-full">
      <CardContent className={styles.emptyState}>
        <Brain className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">{t('noData.title')}</h3>
        <p className="text-muted-foreground max-w-md mb-4">
          {t('noData.description')}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Link href="/dashboard/suggest" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">
              <Sparkles className="h-4 w-4 mr-2" />
              {t('noData.getOutfitSuggestions')}
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={onRecompute}
            disabled={isRefreshing}
            className="w-full sm:w-auto"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? t('noData.computing') : t('noData.computeNow')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          {t('noData.alreadyGaveFeedback')}
        </p>
      </CardContent>
    </Card>
  );
}

export default function LearningPage() {
  const t = useTranslations('learning');
  const colorLabel = useColorLabel();
  const occasionLabel = useOccasionLabel();
  const styleLabel = useStyleLabel();
  const locale = useLocale();
  const timezone = useUserTimezone();
  const { data, isLoading, isError } = useLearning();
  const recompute = useRecomputeLearning();
  const generateInsights = useGenerateInsights();
  const acknowledgeInsight = useAcknowledgeInsight();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRecompute = async () => {
    setIsRefreshing(true);
    try {
      await recompute.mutateAsync();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleGenerateInsights = async () => {
    await generateInsights.mutateAsync();
  };

  const handleAcknowledgeInsight = (insightId: string) => {
    acknowledgeInsight.mutate(insightId);
  };

  if (isLoading) {
    return (
      <div className={styles.page}>
        <PageHeader title={t('title')} description={t('subtitle')} icon={<Brain className="h-5 w-5" />} />
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

  const { profile, best_pairs, insights, preference_suggestions } = data;

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('title')}
        description={profile.has_learning_data ? t('subtitle') : t('subtitleEmpty')}
        icon={<Brain className="h-5 w-5" />}
        actions={profile.has_learning_data && (
          <Button variant="outline" onClick={handleRecompute} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {t('recompute')}
          </Button>
        )}
      />

      {!profile.has_learning_data ? (
        <NoLearningData onRecompute={handleRecompute} isRefreshing={isRefreshing} />
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title={t('stats.feedbackGiven')}
              value={profile.feedback_count}
              description={t('stats.outfitsRated', { count: profile.outfits_rated })}
              icon={Activity}
            />
            <StatCard
              title={t('stats.acceptanceRate')}
              value={profile.overall_acceptance_rate != null
                ? t('percent', { value: Math.round(profile.overall_acceptance_rate * 100) })
                : '-'}
              description={profile.overall_acceptance_rate != null
                ? t('stats.suggestionsAccepted')
                : t('stats.notEnoughData')}
              icon={TrendingUp}
              trend={profile.overall_acceptance_rate != null && profile.overall_acceptance_rate > 0.5 ? 'up' : undefined}
            />
            <StatCard
              title={t('stats.averageRating')}
              value={profile.average_rating != null ? profile.average_rating.toFixed(1) : '-'}
              description={profile.average_rating != null
                ? t('stats.outOfStars', { max: RATING_MAX })
                : t('stats.rateMoreOutfits')}
              icon={Sparkles}
            />
            <StatCard
              title={t('stats.styleRating')}
              value={profile.average_style_rating != null ? profile.average_style_rating.toFixed(1) : '-'}
              description={profile.average_style_rating != null ? t('stats.styleSatisfaction') : t('stats.rateOutfitStyles')}
              icon={Heart}
            />
          </div>

          {/* Active Insights */}
          {insights.length > 0 && (
            <Card className="min-w-0">
              <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5" />
                    {t('styleInsights.title')}
                  </CardTitle>
                  <CardDescription>{t('styleInsights.description')}</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={handleGenerateInsights}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  {t('styleInsights.generate')}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {insights.map((insight) => (
                    <InsightCard
                      key={insight.id}
                      insight={insight}
                      onAcknowledge={handleAcknowledgeInsight}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {/* Color Preferences */}
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  {t('colorPreferences.title')}
                </CardTitle>
                <CardDescription>{t('colorPreferences.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                {profile.color_preferences.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t('colorPreferences.noData')}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {profile.color_preferences.slice(0, 8).map((colorScore) => (
                      <ColorPreferenceBar key={colorScore.color} colorScore={colorScore} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Style Preferences */}
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="h-5 w-5" />
                  {t('stylePreferences.title')}
                </CardTitle>
                <CardDescription>{t('stylePreferences.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                {profile.style_preferences.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t('stylePreferences.noData')}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {profile.style_preferences.map((styleScore) => {
                      const isPositive = styleScore.score >= 0;
                      const percentage = Math.abs(styleScore.score) * 100;
                      return (
                        <div key={styleScore.style} className="flex items-center justify-between">
                          <span>{styleLabel(styleScore.style)}</span>
                          <div className="flex items-center gap-2">
                            <Progress
                              value={percentage}
                              className={`w-24 h-2 ${isPositive ? '' : '[&>div]:bg-red-500'}`}
                            />
                            <span className="text-sm text-muted-foreground w-12 text-right">
                              {t('percent', {
                                value: `${isPositive ? '+' : ''}${(styleScore.score * 100).toFixed(0)}`,
                              })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Best Item Pairs */}
          {best_pairs.length > 0 && (
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-red-500" />
                  {t('bestCombinations.title')}
                </CardTitle>
                <CardDescription>{t('bestCombinations.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {best_pairs.map((pair, index) => (
                    <ItemPairCard key={index} pair={pair} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Occasion Patterns */}
          {profile.occasion_patterns.length > 0 && (
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {t('occasionPatterns.title')}
                </CardTitle>
                <CardDescription>{t('occasionPatterns.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {profile.occasion_patterns.map((pattern) => (
                    <div key={pattern.occasion} className="rounded-none border border-border/70 bg-muted/30 p-5">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">{occasionLabel(pattern.occasion)}</h4>
                        <Badge variant="outline">
                          {t('successRate', { percent: Math.round(pattern.success_rate * 100) })}
                        </Badge>
                      </div>
                      {pattern.preferred_colors.length > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-muted-foreground">{t('preferredColors')}</span>
                          <div className="flex gap-1">
                            {pattern.preferred_colors.map((color) => (
                              <div
                                key={color}
                                className="w-4 h-4 rounded border"
                                style={{ backgroundColor: colorSwatch(color) }}
                                title={colorLabel(color)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Weather Preferences */}
          {profile.weather_preferences.length > 0 && (
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cloud className="h-5 w-5" />
                  {t('weatherPreferences.title')}
                </CardTitle>
                <CardDescription>{t('weatherPreferences.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {profile.weather_preferences.map((pref) => (
                    <div key={pref.weather_type} className="rounded-none border border-border/70 bg-muted/30 p-5 text-center">
                      <div className="text-2xl mb-1">
                        {pref.weather_type === 'cold' && '❄️'}
                        {pref.weather_type === 'cool' && '🍂'}
                        {pref.weather_type === 'mild' && '🌤️'}
                        {pref.weather_type === 'hot' && '☀️'}
                      </div>
                      {WEATHER_TYPE_KEYS[pref.weather_type] ? (
                        <h4 className="font-medium">{t(WEATHER_TYPE_KEYS[pref.weather_type])}</h4>
                      ) : (
                        <h4 className="font-medium capitalize">{pref.weather_type}</h4>
                      )}
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('weatherPreferences.layers', { count: pref.preferred_layers.toFixed(1) })}
                      </p>
                      <Badge variant="outline" className="mt-2">
                        {t('successRate', { percent: Math.round(pref.success_rate * 100) })}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preference Suggestions */}
          {preference_suggestions.updated && preference_suggestions.suggestions && (
            <Card className="border-primary/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-primary" />
                  {t('suggestedUpdates.title')}
                </CardTitle>
                <CardDescription>
                  {t('suggestedUpdates.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {preference_suggestions.suggestions.suggested_favorite_colors && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm">{t('suggestedUpdates.addToFavorites')}</span>
                      <div className="flex gap-2">
                        {preference_suggestions.suggestions.suggested_favorite_colors.map((color) => (
                          <Badge key={color} variant="secondary">
                            <div className="w-3 h-3 rounded mr-1 border" style={{ backgroundColor: colorSwatch(color) }} />
                            {colorLabel(color)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {preference_suggestions.suggestions.suggested_avoid_colors && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm">{t('suggestedUpdates.addToAvoid')}</span>
                      <div className="flex gap-2">
                        {preference_suggestions.suggestions.suggested_avoid_colors.map((color) => (
                          <Badge key={color} variant="destructive">
                            <div className="w-3 h-3 rounded mr-1 border" style={{ backgroundColor: colorSwatch(color) }} />
                            {colorLabel(color)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <Link href="/dashboard/settings">
                    <Button variant="outline" size="sm">
                      {t('suggestedUpdates.updatePreferences')}
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Last Updated */}
          {profile.last_computed_at && (
            <p className="text-xs text-muted-foreground text-center">
              {t('lastUpdated', {
                date: formatDate(profile.last_computed_at, locale, {
                  ...DATE_TIME_OPTIONS,
                  timeZone: timezone,
                }),
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
