'use client';

import { PageHeader } from '@/components/page-header';
import styles from '@/components/shared/core-surfaces.module.css';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AlertCircle, Sparkles } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { api, getErrorMessage } from '@/lib/api';
import { applySessionToken } from '@/lib/hooks/use-session-token';
import { invalidateOutfitCaches } from '@/lib/hooks/cache-invalidation';
import { useItem } from '@/lib/hooks/use-items';
import { useWeather } from '@/lib/hooks/use-weather';
import { usePreferences } from '@/lib/hooks/use-preferences';
import { useRecommendationTasks } from '@/lib/recommendations/use-recommendation-tasks';
import { isTaskActive, type RecommendationTask } from '@/lib/recommendations/types';
import type { Item, Outfit } from '@/lib/types';
import type { TempUnit } from '@/lib/temperature';
import { RecommendationForm } from './recommendation-form';
import { OutfitResultsView } from './outfit-results';
import { TaskPanel } from './task-panel';
import { getGreetingKey, type WeatherOverride } from './weather-context';

// Each look is already persisted. Skipping unchosen alternatives avoids leaving pending
// history entries and does not teach the recommender to dislike their overlapping items.
async function discardAlternatives(outfits: Outfit[], keepId?: string) {
  await Promise.allSettled(outfits.filter((outfit) => outfit.id !== keepId).map((outfit) => api.post(`/outfits/${outfit.id}/skip`)));
}

function weatherFromTask(task: RecommendationTask): WeatherOverride | null {
  const weather = task.request.weather_override;
  if (!weather) return null;
  const condition = weather.condition.toLowerCase();
  return { temperature: weather.temperature, condition: condition.includes('rain') ? 'rainy' : condition.includes('cloud') ? 'cloudy' : 'sunny' };
}

export function RecommendationWorkspace() {
  const t = useTranslations('suggest');
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const preselectedItemId = searchParams.get('item');
  const tasks = useRecommendationTasks();
  const { data: weather, isLoading: weatherLoading } = useWeather();
  const { data: prefs } = usePreferences();
  const temperatureUnit: TempUnit = prefs?.temperature_unit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
  const [selectedOccasion, setSelectedOccasion] = useState<string | null>(null);
  const [weatherOverride, setWeatherOverride] = useState<WeatherOverride | null>(null);
  const [count, setCount] = useState<1 | 3>(3);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [restoredItemId, setRestoredItemId] = useState<string | null | undefined>(undefined);
  const { data: initialItem } = useItem(restoredItemId === undefined ? preselectedItemId || '' : restoredItemId || '');
  const [excludedItems, setExcludedItems] = useState<string[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const [isCompareAll, setIsCompareAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  const initializedOccasion = useRef(false);
  const initializedItem = useRef<string | null>(null);
  const restoredTask = useRef<string | null>(null);
  const appliedResult = useRef<string | null>(null);
  const generationInFlight = useRef(false);
  const responseInFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const isGenerating = tasks.isSubmitting || !!tasks.activeTask && isTaskActive(tasks.activeTask);

  useEffect(() => {
    if (initialItem && initializedItem.current !== initialItem.id) {
      setSelectedItem(initialItem);
      initializedItem.current = initialItem.id;
    }
  }, [initialItem]);

  useEffect(() => {
    if (prefs?.default_occasion && !initializedOccasion.current) {
      setSelectedOccasion((current) => current ?? prefs.default_occasion);
      initializedOccasion.current = true;
    }
  }, [prefs?.default_occasion]);

  useEffect(() => {
    const task = tasks.activeTask;
    if (!task || restoredTask.current === task.id) return;
    restoredTask.current = task.id;
    setSelectedOccasion(task.request.occasion ?? 'casual');
    setWeatherOverride(weatherFromTask(task));
    setCount(task.request.count === 1 ? 1 : 3);
    setExcludedItems(task.request.exclude_items ?? []);
    setRestoredItemId(task.request.include_items?.[0] ?? null);
    setSelectedItem(null);
    initializedItem.current = null;
  }, [tasks.activeTask]);

  useEffect(() => {
    const task = tasks.activeTask;
    if (!task || !tasks.outfits || appliedResult.current === task.id) return;
    appliedResult.current = task.id;
    setOutfits(tasks.outfits);
    setActiveOptionIndex(0);
    setIsCompareAll(false);
  }, [tasks.activeTask, tasks.outfits]);

  async function handleGenerate() {
    if (!selectedOccasion || isGenerating || generationInFlight.current) return;
    generationInFlight.current = true;
    setError(null);
    setOutfits([]);
    try {
      await tasks.submit({
        occasion: selectedOccasion,
        count,
        include_items: selectedItem ? [selectedItem.id] : [],
        exclude_items: excludedItems,
        ...(weatherOverride ? { weather_override: {
          temperature: weatherOverride.temperature,
          feels_like: weatherOverride.temperature,
          humidity: 50,
          precipitation_chance: weatherOverride.condition === 'rainy' ? 80 : weatherOverride.condition === 'cloudy' ? 30 : 10,
          condition: weatherOverride.condition,
        } } : {}),
      });
    } catch (err) {
      setError(getErrorMessage(err, t('error')));
    } finally { generationInFlight.current = false; }
  }

  function clearResults() {
    tasks.clearSelection();
    setOutfits([]);
    setActiveOptionIndex(0);
    setIsCompareAll(false);
    appliedResult.current = null;
    restoredTask.current = null;
  }

  async function discardCurrentAlternatives(keepId?: string) {
    await discardAlternatives(outfits, keepId);
    invalidateOutfitCaches(queryClient);
  }

  async function handleAccept(target?: Outfit) {
    const chosen = target ?? outfits[activeOptionIndex];
    if (!chosen || responseInFlight.current) return;
    responseInFlight.current = true;
    applySessionToken(session);
    setIsResponding(true);
    setError(null);
    try {
      await api.post(`/outfits/${chosen.id}/accept`);
      if (!mounted.current) return;
      await discardCurrentAlternatives(chosen.id);
      clearResults();
      setSelectedOccasion(null);
    } catch (err) {
      setError(getErrorMessage(err, t('tasks.actionError')));
    } finally { responseInFlight.current = false; setIsResponding(false); }
  }

  async function handleTryAnother() {
    if (responseInFlight.current || isGenerating) return;
    responseInFlight.current = true;
    setIsResponding(true);
    setError(null);
    applySessionToken(session);
    try {
      await discardCurrentAlternatives();
      if (mounted.current) await handleGenerate();
    } catch (err) {
      setError(getErrorMessage(err, t('tasks.actionError')));
    } finally { responseInFlight.current = false; setIsResponding(false); }
  }

  async function handleReject(target?: Outfit) {
    const rejected = target ?? outfits[activeOptionIndex];
    if (!rejected || responseInFlight.current) return;
    responseInFlight.current = true;
    applySessionToken(session);
    setIsResponding(true);
    setError(null);
    try {
      await api.post(`/outfits/${rejected.id}/reject`);
      invalidateOutfitCaches(queryClient);
      if (!mounted.current) return;
      const remaining = outfits.filter((outfit) => outfit.id !== rejected.id);
      setOutfits(remaining);
      setActiveOptionIndex((index) => Math.min(index, Math.max(0, remaining.length - 1)));
      if (!remaining.length) await handleGenerate();
    } catch (err) {
      setError(getErrorMessage(err, t('tasks.actionError')));
    } finally { responseInFlight.current = false; setIsResponding(false); }
  }

  async function handleNewRequest() {
    if (responseInFlight.current) return;
    responseInFlight.current = true;
    setIsResponding(true);
    setError(null);
    applySessionToken(session);
    try {
      await discardCurrentAlternatives();
      if (!mounted.current) return;
      clearResults();
      setSelectedOccasion(null);
      setExcludedItems([]);
    } catch (err) {
      setError(getErrorMessage(err, t('tasks.actionError')));
    } finally { responseInFlight.current = false; setIsResponding(false); }
  }

  function openTask(task: RecommendationTask) {
    setOutfits([]);
    setError(null);
    appliedResult.current = null;
    tasks.openTask(task.id);
  }

  async function handleTaskAction(action: 'retry' | 'cancel', taskId: string) {
    setError(null);
    try {
      await tasks[action](taskId);
    } catch (err) {
      setError(getErrorMessage(err, t('tasks.actionError')));
    }
  }

  return (
    <div className={`page-container ${styles.page}`}>
      <PageHeader title={t(getGreetingKey())} description={t('subtitle')} icon={<Sparkles className="h-5 w-5" />} />
      {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
      <TaskPanel
        tasks={tasks.tasks} activeTask={tasks.activeTask} loading={tasks.isLoading}
        busy={tasks.isActing || tasks.isSubmitting || isResponding} loadingResults={tasks.isLoadingResults}
        error={tasks.error && !error ? t('tasks.networkError') : null}
        onOpen={openTask} onRetry={(id) => { void handleTaskAction('retry', id); }} onCancel={(id) => { void handleTaskAction('cancel', id); }}
        onRefresh={() => { void tasks.refresh(); }}
      />
      {outfits.length === 0 ? (
        <RecommendationForm
          occasion={selectedOccasion} onOccasionChange={setSelectedOccasion} defaultOccasion={prefs?.default_occasion}
          selectedItem={selectedItem} onItemChange={setSelectedItem} weather={weather} weatherLoading={weatherLoading}
          weatherOverride={weatherOverride} onWeatherOverrideChange={setWeatherOverride} temperatureUnit={temperatureUnit}
          count={count} onCountChange={setCount} busy={isGenerating} onGenerate={() => { void handleGenerate(); }}
        />
      ) : (
        <OutfitResultsView
          outfits={outfits} activeOptionIndex={activeOptionIndex} onSelectOption={setActiveOptionIndex}
          isCompareAll={isCompareAll} onToggleCompareAll={() => setIsCompareAll((current) => !current)}
          occasion={selectedOccasion ?? 'casual'} temperatureUnit={temperatureUnit} baseItemId={selectedItem?.id}
          onAccept={handleAccept} onReject={handleReject} onTryAnother={handleTryAnother} onNewRequest={handleNewRequest} busy={isResponding || isGenerating} t={t}
        />
      )}
    </div>
  );
}
