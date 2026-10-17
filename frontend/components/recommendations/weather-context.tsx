'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Cloud, Sun, CloudRain, Thermometer, Droplets, ChevronDown, MapPin, Wind, Cloudy, CloudSun, Snowflake, CloudLightning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useWeatherConditionLabel } from '@/lib/hooks/use-translated-constants';
import type { CurrentWeather } from '@/lib/types';
import { cn } from '@/lib/utils';
import { type TempUnit, formatTemp, displayValue, toF, toCelsius } from '@/lib/temperature';
import type { Translator } from '@/lib/recommendations/presentation';

const OVERRIDE_CONDITION_KEYS: Record<string, string> = {
  sunny: 'clear',
  cloudy: 'cloudy',
  rainy: 'rain',
};

// Weather condition to icon mapping
function getWeatherIcon(condition: string, isDay: boolean) {
  const c = condition.toLowerCase();
  if (c.includes('rain') || c.includes('drizzle')) return <CloudRain className="h-8 w-8" />;
  if (c.includes('snow')) return <Snowflake className="h-8 w-8" />;
  if (c.includes('thunder') || c.includes('storm')) return <CloudLightning className="h-8 w-8" />;
  if (c.includes('cloud') && c.includes('part')) return <CloudSun className="h-8 w-8" />;
  if (c.includes('cloud') || c.includes('overcast')) return <Cloudy className="h-8 w-8" />;
  return isDay ? <Sun className="h-8 w-8" /> : <Cloud className="h-8 w-8" />;
}

// Get time-based greeting key
export function getGreetingKey(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'greeting.morning';
  if (hour < 17) return 'greeting.afternoon';
  return 'greeting.evening';
}

// Get weather-based outfit hint key
function getWeatherHintKey(weather: CurrentWeather): string {
  const temp = weather.temperature;
  const condition = weather.condition.toLowerCase();

  if (weather.precipitation_chance > 50) return 'weatherHints.rainy';
  if (temp < 10) return 'weatherHints.cold';
  if (temp < 18) return 'weatherHints.mild';
  if (temp > 28) return 'weatherHints.hot';
  if (condition.includes('wind')) return 'weatherHints.windy';
  return 'weatherHints.nice';
}

export interface WeatherOverride {
  temperature: number;
  condition: 'sunny' | 'cloudy' | 'rainy';
}

export function WeatherCard({ weather, isLoading, temperatureUnit, t }: { weather?: CurrentWeather; isLoading: boolean; temperatureUnit: TempUnit; t: Translator }) {
  const conditionLabel = useWeatherConditionLabel();
  if (isLoading) {
    return (
      <Card className="border-muted">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!weather) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
              <MapPin className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">{t('location.notSet')}</p>
              <p className="text-sm text-muted-foreground">
                {t('location.setDescription')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-foreground">
              {getWeatherIcon(weather.condition, weather.is_day)}
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight">{displayValue(weather.temperature, temperatureUnit)}</span>
                <span className="text-lg text-muted-foreground">{temperatureUnit === 'fahrenheit' ? '°F' : '°C'}</span>
              </div>
              <p className="text-sm text-muted-foreground">{conditionLabel(weather.condition)}</p>
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground space-y-1">
            <div className="flex items-center gap-1.5 justify-end">
              <Thermometer className="h-3.5 w-3.5" />
              <span>{t('weather.feelsLike', { temp: displayValue(weather.feels_like, temperatureUnit) })}</span>
            </div>
            <div className="flex items-center gap-1.5 justify-end">
              <Droplets className="h-3.5 w-3.5" />
              <span>{t('weather.rainChance', { chance: weather.precipitation_chance })}</span>
            </div>
            <div className="flex items-center gap-1.5 justify-end">
              <Wind className="h-3.5 w-3.5" />
              <span>{t('weather.windSpeed', { speed: Math.round(weather.wind_speed) })}</span>
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            {t(getWeatherHintKey(weather))}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function WeatherOverrideSection({
  weather,
  onChange,
  temperatureUnit,
  t,
}: {
  weather: WeatherOverride | null;
  onChange: (weather: WeatherOverride | null) => void;
  temperatureUnit: TempUnit;
  t: Translator;
}) {
  const tc = useTranslations('constants.weatherConditions');
  const [isOpen, setIsOpen] = useState(false);
  const conditions = [
    { value: 'sunny', icon: <Sun className="h-4 w-4" /> },
    { value: 'cloudy', icon: <Cloud className="h-4 w-4" /> },
    { value: 'rainy', icon: <CloudRain className="h-4 w-4" /> },
  ] as const;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button type="button" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
          <span>{weather ? t('weatherOverride.active') : t('weatherOverride.overrideWeather')}</span>
          {weather && (
            <Badge variant="secondary" className="text-xs">
              {tc(OVERRIDE_CONDITION_KEYS[weather.condition])} {formatTemp(weather.temperature, temperatureUnit)}
            </Badge>
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4">
        <div className="space-y-4 p-4 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('weatherOverride.condition')}</span>
            {weather && (
              <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
                {t('weatherOverride.reset')}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {conditions.map((c) => (
              <button
                type="button"
                key={c.value}
                onClick={() =>
                  onChange({
                    temperature: weather?.temperature ?? 20,
                    condition: c.value,
                  })
                }
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all',
                  weather?.condition === c.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-muted bg-background hover:border-primary/50'
                )}
              >
                {c.icon}
                <span className="text-sm">{tc(OVERRIDE_CONDITION_KEYS[c.value])}</span>
              </button>
            ))}
          </div>
          {weather && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{t('weatherOverride.temperature')}</span>
              <input
                type="range"
                aria-label={t('weatherOverride.temperature')}
                min={temperatureUnit === 'fahrenheit' ? 14 : -10}
                max={temperatureUnit === 'fahrenheit' ? 104 : 40}
                value={temperatureUnit === 'fahrenheit' ? Math.round(toF(weather.temperature)) : weather.temperature}
                onChange={(e) => {
                  const raw = parseInt(e.target.value);
                  onChange({ ...weather, temperature: temperatureUnit === 'fahrenheit' ? Math.round(toCelsius(raw)) : raw });
                }}
                className="flex-1 accent-primary"
              />
              <span className="text-sm font-medium w-14 text-right">{formatTemp(weather.temperature, temperatureUnit)}</span>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

