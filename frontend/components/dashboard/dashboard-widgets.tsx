"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  CloudSun,
  Droplets,
  Heart,
  HeartHandshake,
  Lightbulb,
  Loader2,
  Palette,
  RefreshCw,
  Shirt,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Users,
  WashingMachine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalyticsData } from "@/lib/hooks/use-analytics";
import type { TaggingProgress } from "@/lib/types";
import {
  useOutfits,
  useAcceptOutfit,
  useRejectOutfit,
} from "@/lib/hooks/use-outfits";
import { useWeather } from "@/lib/hooks/use-weather";
import { usePreferences } from "@/lib/hooks/use-preferences";
import { useFamily } from "@/lib/hooks/use-family";
import {
  useSchedules,
  useNotificationSettings,
} from "@/lib/hooks/use-notifications";
import { useUserTimezone } from "@/lib/hooks/use-user";
import { useOutfitTitle } from "@/lib/hooks/use-outfit-title";
import { useAnalyticsInsightLines } from "@/lib/hooks/use-insight-text";
import {
  useColorLabel,
  useOccasionLabel,
  useTypeLabel,
  useWeatherConditionLabel,
} from "@/lib/hooks/use-translated-constants";
import { ApiError } from "@/lib/api";
import { colorSwatch } from "@/lib/colors";
import { displayValue, tempSymbol } from "@/lib/temperature";
import { findNextSchedule } from "@/lib/schedules";
import { formatShortDate } from "@/lib/utils";
import { toast } from "sonner";
import styles from "./dashboard-home.module.css";

export function SectionError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("dashboard.overview");
  return (
    <div className={styles.sectionError} role="status">
      <p>{t("dataError")}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
        {t("refresh")}
      </Button>
    </div>
  );
}

export function OverviewMetrics({
  inventory,
  inventoryLoading,
  inventoryError,
  analytics,
  analyticsLoading,
  analyticsError,
}: {
  inventory?: number;
  inventoryLoading: boolean;
  inventoryError: boolean;
  analytics?: AnalyticsData;
  analyticsLoading: boolean;
  analyticsError: boolean;
}) {
  const t = useTranslations("dashboard");
  const stats = analytics?.wardrobe;
  const values = [
    {
      label: t("overview.inventory"),
      value: inventory,
      loading: inventoryLoading,
      error: inventoryError,
      icon: Shirt,
      href: "/dashboard/wardrobe",
    },
    {
      label: t("overview.records"),
      value: stats?.total_outfits,
      loading: analyticsLoading,
      error: analyticsError,
      icon: CalendarDays,
      href: "/dashboard/outfits",
    },
    {
      label: t("overview.last7Days"),
      value: stats?.outfits_this_week,
      loading: analyticsLoading,
      error: analyticsError,
      icon: Sparkles,
      href: "/dashboard/history",
    },
    {
      label: t("overview.acceptance"),
      value:
        stats?.acceptance_rate == null
          ? undefined
          : `${stats.acceptance_rate}%`,
      loading: analyticsLoading,
      error: analyticsError,
      icon: TrendingUp,
      href: "/dashboard/analytics",
    },
  ];
  return (
    <section aria-label={t("overview.title")} className={styles.metrics}>
      {values.map(
        ({ label, value, loading, error, icon: Icon, href }, index) => (
          <Link href={href} className={styles.metric} key={label}>
            <div className={styles.metricLabel}>
              {label}
              <Icon size={18} aria-hidden="true" />
            </div>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <strong
                className={
                  value == null || error
                    ? styles.missingValue
                    : styles.metricValue
                }
              >
                {error || value == null ? t("overview.noValue") : value}
              </strong>
            )}
            {index === 3 &&
              !analyticsError &&
              stats?.average_rating != null && (
                <span className={styles.metricCaption}>
                  {t("weeklySummary.avgRatingValue", {
                    rating: stats.average_rating,
                  })}
                </span>
              )}
          </Link>
        ),
      )}
    </section>
  );
}

export function PendingLooksPanel() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const getTitle = useOutfitTitle();
  const typeLabel = useTypeLabel();
  const query = useOutfits(
    {
      status: "pending",
      source: "scheduled,on_demand",
      is_lookbook: false,
      worn: false,
    },
    1,
    2,
  );
  const accept = useAcceptOutfit();
  const reject = useRejectOutfit();
  const busy = accept.isPending || reject.isPending;
  const decide = async (id: string, accepted: boolean) => {
    try {
      if (accepted) await accept.mutateAsync(id);
      else await reject.mutateAsync(id);
      toast.success(
        t(accepted ? "pendingOutfits.accepted" : "pendingOutfits.dismissed"),
      );
    } catch {
      toast.error(
        t(
          accepted
            ? "pendingOutfits.acceptFailed"
            : "pendingOutfits.dismissFailed",
        ),
      );
    }
  };
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <div>
          <h2>
            {t("overview.pendingTitle")}
            {!query.isError && query.data != null && query.data.total > 0 && (
              <Badge variant="secondary">{query.data.total}</Badge>
            )}
          </h2>
          <p>{t("overview.pendingDescription")}</p>
        </div>
        <Link href="/dashboard/outfits?filter=ai" className={styles.textLink}>
          {t("overview.reviewHistory")}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
      {query.isError ? (
        <SectionError
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : query.isLoading ? (
        <div className={styles.lookGrid}>
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : !query.data?.outfits.length ? (
        <Card className={styles.emptyLook}>
          <Sparkles size={25} aria-hidden="true" />
          <div>
            <h3>{t("overview.pendingEmptyTitle")}</h3>
            <p>{t("overview.pendingEmptyDescription")}</p>
          </div>
          <Button asChild size="sm">
            <Link href="/dashboard/suggest">
              {t("quickActions.getOutfitSuggestion")}
              <ArrowRight size={15} className="ml-2" aria-hidden="true" />
            </Link>
          </Button>
        </Card>
      ) : (
        <div className={styles.lookGrid}>
          {query.data.outfits.slice(0, 2).map((outfit) => (
            <Card className={styles.lookCard} key={outfit.id}>
              <Link
                href={`/dashboard/outfits/${encodeURIComponent(outfit.id)}`}
                aria-label={`${t("overview.viewOutfit")}: ${getTitle(outfit)}`}
                className={styles.lookPhotos}
              >
                {outfit.items.slice(0, 4).map((item) => (
                  <div key={item.id}>
                    {item.thumbnail_url || item.image_url ? (
                      <Image
                        src={(item.thumbnail_url || item.image_url)!}
                        alt={item.name || typeLabel(item.type)}
                        fill
                        sizes="(min-width: 1024px) 180px, 30vw"
                        className="object-contain"
                      />
                    ) : (
                      <Shirt size={30} aria-hidden="true" />
                    )}
                  </div>
                ))}
                {outfit.items.length === 0 && (
                  <Shirt size={35} aria-hidden="true" />
                )}
              </Link>
              <div className={styles.lookBody}>
                <div className={styles.lookMeta}>
                  <h3>{getTitle(outfit)}</h3>
                  <span>
                    {outfit.scheduled_for
                      ? formatShortDate(outfit.scheduled_for, locale)
                      : t("pendingOutfits.lookbook")}
                  </span>
                </div>
                <p>
                  {t("overview.outfitItems", { count: outfit.items.length })} ·{" "}
                  {outfit.items
                    .slice(0, 3)
                    .map((item) => typeLabel(item.type))
                    .join(" / ")}
                </p>
                <div className={styles.lookActions}>
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/dashboard/outfits/${encodeURIComponent(outfit.id)}`}
                    >
                      {t("overview.viewOutfit")}
                    </Link>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`${t("pendingOutfits.dismissLabel")}: ${getTitle(outfit)}`}
                    onClick={() => {
                      void decide(outfit.id, false);
                    }}
                  >
                    <ThumbsDown size={16} aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    disabled={busy}
                    aria-label={`${t("overview.acceptLabel")}: ${getTitle(outfit)}`}
                    onClick={() => {
                      void decide(outfit.id, true);
                    }}
                  >
                    <ThumbsUp size={16} aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

export function WeatherPanel() {
  const weather = useWeather();
  const { data: prefs } = usePreferences();
  const t = useTranslations("dashboard");
  const conditionLabel = useWeatherConditionLabel();
  const unit =
    prefs?.temperature_unit === "fahrenheit" ? "fahrenheit" : "celsius";
  const missingLocation =
    weather.error instanceof ApiError && weather.error.status === 400;
  return (
    <Card className={`${styles.sidePanel} ${styles.weather}`}>
      <div className={styles.sideTitle}>
        <CloudSun size={19} aria-hidden="true" />
        <h2>{t("weather.title")}</h2>
      </div>
      {weather.isLoading ? (
        <Skeleton className="h-20" />
      ) : weather.data ? (
        <>
          <div className={styles.temperature}>
            {displayValue(weather.data.temperature, unit)}
            <span>{tempSymbol(unit)}</span>
          </div>
          <p>{conditionLabel(weather.data.condition)}</p>
          <div className={styles.weatherDetails}>
            <span>
              {t("weather.feelsLike", {
                temp: `${displayValue(weather.data.feels_like, unit)}°`,
              })}
            </span>
            <span>
              <Droplets size={13} aria-hidden="true" />
              {t("weather.rainChance", {
                percent: weather.data.precipitation_chance,
              })}
            </span>
          </div>
        </>
      ) : (
        <div className={styles.compactEmpty}>
          <p>
            {t(
              missingLocation
                ? "weather.locationNotSet"
                : "overview.weatherUnavailable",
            )}
          </p>
          {missingLocation ? (
            <Link
              className={styles.textLink}
              href="/dashboard/settings#settings-location"
            >
              {t("weather.setLocation")}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void weather.refetch();
              }}
            >
              {t("overview.refresh")}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export function CarePanel({
  washingTotal,
  washingLoading,
  washingError,
  onRetryWashing,
  tagging,
  taggingLoading,
  taggingError,
  onRetryTagging,
}: {
  washingTotal?: number;
  washingLoading: boolean;
  washingError: boolean;
  onRetryWashing: () => void;
  tagging?: TaggingProgress;
  taggingLoading: boolean;
  taggingError: boolean;
  onRetryTagging: () => void;
}) {
  const t = useTranslations("dashboard.overview");
  return (
    <Card className={styles.sidePanel}>
      <div className={styles.sideTitle}>
        <CheckCircle2 size={18} aria-hidden="true" />
        <h2>{t("attentionTitle")}</h2>
      </div>
      {washingError ? (
        <SectionError onRetry={onRetryWashing} />
      ) : washingLoading ? (
        <Skeleton className="h-14" />
      ) : (
        <Link
          className={styles.careRow}
          href="/dashboard/wardrobe?needsWash=true"
        >
          <span className={styles.rowIcon}>
            <WashingMachine size={18} aria-hidden="true" />
          </span>
          <span>
            <strong>{t("washTitle")}</strong>
            <small>
              {washingTotal == null
                ? t("noValue")
                : washingTotal > 0
                  ? t("washCount", { count: washingTotal })
                  : t("washClear")}
            </small>
          </span>
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      )}
      {taggingError ? (
        <SectionError onRetry={onRetryTagging} />
      ) : taggingLoading ? (
        <Skeleton className="h-14" />
      ) : tagging ? (
        <div className={styles.taggingRows}>
          {tagging.processing > 0 && (
            <Link className={styles.careRow} href="/dashboard/wardrobe">
              <span className={styles.rowIcon}>
                <Loader2
                  size={18}
                  className="animate-spin"
                  aria-hidden="true"
                />
              </span>
              <span>
                <strong>{t("processingTitle")}</strong>
                <small>
                  {t("processingCount", { count: tagging.processing })}
                </small>
              </span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          )}
          {tagging.failed > 0 && (
            <Link className={styles.careRow} href="/dashboard/wardrobe">
              <span className={styles.rowIcon}>
                <RefreshCw size={18} aria-hidden="true" />
              </span>
              <span>
                <strong>{t("failedTitle")}</strong>
                <small>{t("failedCount", { count: tagging.failed })}</small>
              </span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          )}
          {tagging.processing === 0 && tagging.failed === 0 && (
            <div className={styles.careRow}>
              <span className={styles.rowIcon}>
                <Check size={18} aria-hidden="true" />
              </span>
              <small>{t("taggingClear")}</small>
            </div>
          )}
        </div>
      ) : (
        <p className={styles.muted}>{t("noValue")}</p>
      )}
    </Card>
  );
}

export function DailySetupPanel() {
  const schedules = useSchedules();
  const channels = useNotificationSettings();
  const timezone = useUserTimezone();
  const t = useTranslations("dashboard");
  const days = useTranslations("notifications");
  const occasionLabel = useOccasionLabel();
  const next = useMemo(
    () => (schedules.data ? findNextSchedule(schedules.data, timezone) : null),
    [schedules.data, timezone],
  );
  const dayNames = [
    days("days.monday"),
    days("days.tuesday"),
    days("days.wednesday"),
    days("days.thursday"),
    days("days.friday"),
    days("days.saturday"),
    days("days.sunday"),
  ];
  return (
    <Card className={styles.sidePanel}>
      <div className={styles.sideTitle}>
        <Clock size={18} aria-hidden="true" />
        <h2>{t("overview.organizationTitle")}</h2>
      </div>
      <p className={styles.sideDescription}>
        {t("overview.dailySetupDescription")}
      </p>
      {schedules.isError ? (
        <SectionError
          onRetry={() => {
            void schedules.refetch();
          }}
        />
      ) : schedules.isLoading ? (
        <Skeleton className="h-12" />
      ) : (
        <Link className={styles.setupRow} href="/dashboard/notifications">
          <CalendarDays size={18} aria-hidden="true" />
          <span>
            <strong>{t("nextScheduled.title")}</strong>
            <small>
              {next
                ? t("nextScheduled.dayAtTime", {
                    day:
                      next.daysUntil === 0
                        ? t("nextScheduled.today")
                        : next.daysUntil === 1
                          ? t("nextScheduled.tomorrow")
                          : dayNames[next.notifyDay],
                    time: next.schedule.notification_time.slice(0, 5),
                  })
                : t("nextScheduled.setUpSchedule")}
            </small>
            {next && <small>{occasionLabel(next.schedule.occasion)}</small>}
          </span>
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      )}
      {channels.isError ? (
        <SectionError
          onRetry={() => {
            void channels.refetch();
          }}
        />
      ) : channels.isLoading ? (
        <Skeleton className="h-12" />
      ) : (
        <Link className={styles.setupRow} href="/dashboard/notifications">
          <Bell size={18} aria-hidden="true" />
          <span>
            <strong>{t("notifications.title")}</strong>
            <small>
              {channels.data?.length
                ? t("notifications.activeCount", {
                    active: channels.data.filter((c) => c.enabled).length,
                    total: channels.data.length,
                  })
                : t("notifications.addChannel")}
            </small>
          </span>
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      )}
    </Card>
  );
}

export function WardrobeInsights({
  analytics,
  isLoading,
  isError,
  onRetry,
}: {
  analytics?: AnalyticsData;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const colorLabel = useColorLabel();
  const insights = useAnalyticsInsightLines(analytics);
  return (
    <Card className={styles.insightsPanel}>
      <div className={styles.palette}>
        <div className={styles.sideTitle}>
          <Palette size={19} aria-hidden="true" />
          <h2>{t("overview.colorsTitle")}</h2>
        </div>
        <p className={styles.sideDescription}>
          {t("overview.colorsDescription")}
        </p>
        {isError ? (
          <SectionError onRetry={onRetry} />
        ) : isLoading ? (
          <Skeleton className="h-16" />
        ) : analytics?.color_distribution.length ? (
          <div className={styles.colorList}>
            {analytics.color_distribution.slice(0, 5).map((color) => (
              <div key={color.color} className={styles.colorEntry}>
                <span
                  className={styles.swatch}
                  style={{ background: colorSwatch(color.color) }}
                />
                <span>
                  {colorLabel(color.color)}
                  <small>
                    {t("overview.paletteItems", { count: color.count })}
                  </small>
                </span>
                <strong>{color.percentage}%</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.muted}>{t("overview.noColors")}</p>
        )}
      </div>
      <div className={styles.insightsCopy}>
        <div className={styles.sectionHeading}>
          <div className={styles.sideTitle}>
            <Lightbulb size={19} aria-hidden="true" />
            <h2>{t("insights.title")}</h2>
          </div>
          <Link className={styles.textLink} href="/dashboard/analytics">
            {tc("viewAll")}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        {isError ? (
          <p className={styles.muted}>{t("overview.dataError")}</p>
        ) : isLoading ? (
          <Skeleton className="h-20" />
        ) : insights.length ? (
          <ul>
            {insights.slice(0, 3).map((line, index) => (
              <li key={index}>
                <Sparkles size={16} aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>{t("insights.empty")}</p>
        )}
      </div>
    </Card>
  );
}

export function DashboardShortcuts() {
  const t = useTranslations("dashboard.overview");
  return (
    <section className={styles.section}>
      <h2 className={styles.shortcutTitle}>{t("shortcutsTitle")}</h2>
      <div className={styles.shortcuts}>
        {[
          {
            title: t("studio"),
            href: "/dashboard/outfits/new",
            icon: Sparkles,
          },
          {
            title: t("favorites"),
            href: "/dashboard/wardrobe?favorite=true",
            icon: Heart,
          },
          {
            title: t("wornHistory"),
            href: "/dashboard/outfits?filter=worn",
            icon: CalendarDays,
          },
          {
            title: t("analytics"),
            href: "/dashboard/analytics",
            icon: TrendingUp,
          },
        ].map(({ title, href, icon: Icon }) => (
          <Link href={href} key={href}>
            <Icon size={21} aria-hidden="true" />
            <span>{title}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function FamilyPanel() {
  const family = useFamily();
  const t = useTranslations("dashboard");
  if (
    family.isError &&
    !(family.error instanceof ApiError && family.error.status === 404)
  )
    return (
      <Card className={styles.sidePanel}>
        <div className={styles.sideTitle}>
          <HeartHandshake size={19} aria-hidden="true" />
          <h2>{t("familyFeed.title")}</h2>
        </div>
        <SectionError
          onRetry={() => {
            void family.refetch();
          }}
        />
      </Card>
    );
  if (!family.data || family.isError) return null;
  return (
    <Card className={styles.sidePanel}>
      <div className={styles.sideTitle}>
        <HeartHandshake size={19} aria-hidden="true" />
        <h2>{t("familyFeed.title")}</h2>
      </div>
      <p className={styles.sideDescription}>{t("familyFeed.description")}</p>
      <p className={styles.familyMembers}>
        <Users size={15} aria-hidden="true" />
        {t("familyFeed.memberCount", {
          count: family.data.members.length,
          name: family.data.name,
        })}
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/family/feed">
          {t("familyFeed.browse")}
          <ArrowRight size={15} className="ml-2" aria-hidden="true" />
        </Link>
      </Button>
    </Card>
  );
}
