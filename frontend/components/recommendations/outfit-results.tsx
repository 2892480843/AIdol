'use client';

import styles from '@/components/shared/core-surfaces.module.css';

import Image from 'next/image';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { Shirt, Sparkles, RefreshCw, ThumbsUp, ThumbsDown, Thermometer, Droplets, CalendarDays, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useOccasionLabel, useWeatherConditionLabel, useTypeLabel } from '@/lib/hooks/use-translated-constants';
import type { Outfit } from '@/lib/types';
import { cn, formatShortDate } from '@/lib/utils';
import { type TempUnit, formatTemp, displayValue } from '@/lib/temperature';
import type { Translator } from '@/lib/recommendations/presentation';

function OutfitCard({
  outfit,
  baseItemId,
  temperatureUnit,
  t,
  onAccept,
  onReject,
  showActions = true,
  badgeLabel,
  busy = false,
}: {
  outfit: Outfit;
  baseItemId?: string;
  temperatureUnit: TempUnit;
  t: Translator;
  onAccept?: () => void;
  onReject?: () => void;
  showActions?: boolean;
  badgeLabel?: string;
  busy?: boolean;
}) {
  const typeLabel = useTypeLabel();
  return (
    <Card className={styles.resultCard}>
      <div className={styles.resultHeading}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
            <h3 className="font-semibold text-base truncate">
              {outfit.reasoning || (badgeLabel ?? t('yourOutfit'))}
            </h3>
          </div>
          {badgeLabel && (
            <Badge variant="secondary" className="text-xs px-2 py-0.5 flex-shrink-0">
              {badgeLabel}
            </Badge>
          )}
        </div>
        {outfit.highlights && outfit.highlights.length > 0 && (
          <ul className="mt-2.5 space-y-1">
            {outfit.highlights.map((highlight, index) => (
              <li key={index} className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground">
                <span className="text-primary mt-0.5">•</span>
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CardContent className="p-4 flex-1 flex flex-col justify-between space-y-4">
        <div className={styles.resultItems}>
          {outfit.items.map((item) => {
            const isBase = !!baseItemId && item.id === baseItemId;
            return (
              <Link
                key={item.id}
                href={`/dashboard/wardrobe?item=${item.id}`}
                className={cn(
                  'group relative rounded-none border overflow-hidden bg-muted/30 hover:shadow-[3px_3px_0px_#2d2d2d] transition-all',
                  isBase && 'border-primary/60 ring-2 ring-primary/20'
                )}
              >
                <div className="aspect-square relative">
                  {isBase && (
                    <Badge className="absolute top-2 left-2 z-10 bg-primary/95 text-primary-foreground text-[10px] px-2 py-0.5 shadow-[3px_3px_0px_#2d2d2d]">
                      {t('baseItem.basePiece')}
                    </Badge>
                  )}
                  {item.thumbnail_url ? (
                    <Image
                      src={item.thumbnail_url}
                      alt={item.name || typeLabel(item.type)}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform"
                      sizes="(max-width: 640px) 50vw, 33vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <Shirt className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs sm:text-sm font-medium truncate">
                    {item.name || typeLabel(item.type)}
                  </p>
                  {item.layer_type && (
                    <Badge variant="secondary" className="text-[10px] capitalize mt-0.5">
                      {item.layer_type}
                    </Badge>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        {outfit.style_notes && (
          <div className="p-2.5 bg-muted/60 rounded-none border text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{t('tip')}</span> {outfit.style_notes}
          </div>
        )}

        {showActions && (
          <div className="pt-2 flex gap-2 justify-end border-t mt-auto">
            {onReject && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy} onClick={onReject}
                className="h-8 px-2.5 text-muted-foreground hover:text-destructive"
                aria-label={t('dismissOutfit')}
              >
                <ThumbsDown className="h-4 w-4" />
              </Button>
            )}
            {onAccept && (
              <Button size="sm" disabled={busy} onClick={onAccept} className="gap-1.5 text-xs h-8">
                <ThumbsUp className="h-3.5 w-3.5" />
                {t('options.chooseThis')}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function OutfitResultsView({
  outfits,
  occasion,
  temperatureUnit,
  baseItemId,
  activeOptionIndex,
  onSelectOption,
  isCompareAll,
  onToggleCompareAll,
  onAccept,
  onReject,
  onTryAnother,
  onNewRequest,
  busy = false,
  t,
}: {
  outfits: Outfit[];
  occasion: string;
  temperatureUnit: TempUnit;
  baseItemId?: string;
  activeOptionIndex: number;
  onSelectOption: (index: number) => void;
  isCompareAll: boolean;
  onToggleCompareAll: () => void;
  onAccept: (outfit?: Outfit) => void;
  onReject: (outfit?: Outfit) => void;
  onTryAnother: () => void;
  onNewRequest: () => void;
  busy?: boolean;
  t: Translator;
}) {
  const locale = useLocale();
  const conditionLabel = useWeatherConditionLabel();
  const occasionLabel = useOccasionLabel();
  const currentOutfit = outfits[activeOptionIndex] || outfits[0];

  return (
    <div className="space-y-6">
      {/* Header with occasion and start over */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-sm px-3 py-1">
            {occasionLabel(occasion)}
          </Badge>
          {currentOutfit?.scheduled_for && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              {formatShortDate(currentOutfit.scheduled_for, locale)}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onNewRequest}>
          {t('startOver')}
        </Button>
      </div>

      {/* Weather info */}
      {currentOutfit?.weather && (
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground p-3 rounded-none bg-muted/50">
          <div className="flex items-center gap-1.5">
            <Thermometer className="h-4 w-4" />
            <span>{formatTemp(currentOutfit.weather.temperature, temperatureUnit)}</span>
            <span className="text-xs opacity-70">{t('weather.feelsLikeInline', { temp: displayValue(currentOutfit.weather.feels_like, temperatureUnit) })}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Droplets className="h-4 w-4" />
            <span>{t('weather.rainChance', { chance: currentOutfit.weather.precipitation_chance })}</span>
          </div>
          <Badge variant="outline">
            {conditionLabel(currentOutfit.weather.condition)}
          </Badge>
        </div>
      )}

      {/* Options Switcher Bar (when multiple outfits exist) */}
      {outfits.length > 1 && (
        <div className={styles.resultChoices}>
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            {outfits.map((opt, idx) => (
              <Button variant="ghost"
                key={opt.id}
                type="button"
                onClick={() => onSelectOption(idx)}
                aria-pressed={!isCompareAll && activeOptionIndex === idx}
                className={cn(
                  'px-3 py-1.5 rounded-none text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 flex-shrink-0',
                  !isCompareAll && activeOptionIndex === idx
                    ? 'bg-background text-foreground shadow-[3px_3px_0px_#2d2d2d]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                )}
              >
                <Sparkles className={cn("h-3.5 w-3.5", !isCompareAll && activeOptionIndex === idx ? "text-primary" : "opacity-40")} />
                <span>{t('options.optionNumber', { number: idx + 1 })}</span>
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1 pt-1.5 sm:pt-0 border-t sm:border-t-0 justify-end">
            <Button
              variant={isCompareAll ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={onToggleCompareAll}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>{isCompareAll ? t('options.singleView') : t('options.allOptions')}</span>
            </Button>
          </div>
        </div>
      )}

      {/* View: All Outfits Side-by-Side Grid */}
      {isCompareAll ? (
        <div className="space-y-6">
          <div className={styles.collection}>
            {outfits.map((opt, idx) => (
              <OutfitCard
                key={opt.id}
                outfit={opt}
                baseItemId={baseItemId}
                temperatureUnit={temperatureUnit}
                t={t}
                badgeLabel={t('options.optionNumber', { number: idx + 1 })}
                onAccept={() => onAccept(opt)}
                onReject={() => onReject(opt)}
                showActions={true}
                busy={busy}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <Button variant="outline" size="lg" disabled={busy} onClick={onTryAnother} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              {t('options.generateNew')}
            </Button>
          </div>
        </div>
      ) : (
        /* View: Single Active Outfit Focus */
        <div className="space-y-6">
          <OutfitCard
            outfit={currentOutfit}
            baseItemId={baseItemId}
            temperatureUnit={temperatureUnit}
            t={t}
            badgeLabel={outfits.length > 1 ? t('options.optionNumber', { number: activeOptionIndex + 1 }) : undefined}
            onAccept={() => onAccept(currentOutfit)}
            onReject={() => onReject(currentOutfit)}
            showActions={false}
            busy={busy}
          />

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 justify-center">
            <Button variant="outline" size="lg" disabled={busy} onClick={onTryAnother} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              {outfits.length > 1 ? t('options.generateNew') : t('tryAnother')}
            </Button>
            <Button size="lg" disabled={busy} onClick={() => onAccept(currentOutfit)} className="gap-2">
              <ThumbsUp className="h-4 w-4" />
              {t('loveIt')}
            </Button>
            <Button variant="ghost" size="lg" disabled={busy} onClick={() => onReject(currentOutfit)} className="px-3" aria-label={t('dismissOutfit')}>
              <ThumbsDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

