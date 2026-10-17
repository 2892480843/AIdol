'use client';

import styles from '@/components/shared/core-surfaces.module.css';

import { useTranslations } from 'next-intl';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { OccasionChips } from '@/components/shared/occasion-chips';
import type { CurrentWeather, Item } from '@/lib/types';
import type { TempUnit } from '@/lib/temperature';
import { cn } from '@/lib/utils';
import { BaseItemPicker } from './base-item-picker';
import { WeatherCard, WeatherOverrideSection, type WeatherOverride } from './weather-context';

interface RecommendationFormProps {
  occasion: string | null;
  onOccasionChange: (occasion: string) => void;
  defaultOccasion?: string;
  selectedItem: Item | null;
  onItemChange: (item: Item | null) => void;
  weather?: CurrentWeather;
  weatherLoading: boolean;
  weatherOverride: WeatherOverride | null;
  onWeatherOverrideChange: (weather: WeatherOverride | null) => void;
  temperatureUnit: TempUnit;
  count: 1 | 3;
  onCountChange: (count: 1 | 3) => void;
  busy: boolean;
  onGenerate: () => void;
}

export function RecommendationForm(props: RecommendationFormProps) {
  const t = useTranslations('suggest');
  return (
    <div className={styles.recommendForm}>
      <WeatherCard weather={props.weather} isLoading={props.weatherLoading} temperatureUnit={props.temperatureUnit} t={t} />
      <Card className={styles.formCard}>
        <CardContent className="p-5 sm:p-6">
          <fieldset disabled={props.busy} className="space-y-6 disabled:opacity-70">
            <div className={`${styles.formSection} space-y-3`}>
              <h2 className={styles.sectionTitle}>{t('occasionPrompt')}</h2>
              <OccasionChips selected={props.occasion} onSelect={props.onOccasionChange} extraOccasions={[props.defaultOccasion]} />
            </div>
            <BaseItemPicker selectedItem={props.selectedItem} onChange={props.onItemChange} />
            <div className="space-y-3 border-t pt-5">
              <h2 className="font-semibold text-sm">{t('lookCount.title')}</h2>
              <div className="grid grid-cols-2 gap-2">
                {([1, 3] as const).map((count) => (
                  <Button variant="outline"
                    key={count}
                    type="button"
                    aria-pressed={props.count === count}
                    onClick={() => props.onCountChange(count)}
                    className={cn(styles.choice, props.count === count ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary/20' : 'hover:border-primary/50')}
                  >
                    {count === 1 ? t('lookCount.single') : t('lookCount.three')}
                  </Button>
                ))}
              </div>
            </div>
            <WeatherOverrideSection disabled={props.busy} weather={props.weatherOverride} onChange={props.onWeatherOverrideChange} temperatureUnit={props.temperatureUnit} t={t} />
            <Button size="lg" className="w-full gap-2" onClick={props.onGenerate} disabled={!props.occasion || props.busy}>
              {props.busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-5 w-5" aria-hidden="true" />}
              {props.busy ? t('generating') : t('getSuggestion')}
            </Button>
          </fieldset>
        </CardContent>
      </Card>
    </div>
  );
}
