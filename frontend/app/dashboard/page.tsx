"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { ArrowRight, Plus, ScanLine, Shirt, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAnalytics } from "@/lib/hooks/use-analytics";
import { useItems, useTaggingProgress } from "@/lib/hooks/use-items";
import { InspirationTeasers } from "@/components/dashboard/inspiration-teasers";
import { LookSwitcher } from "@/components/looks/look-switcher";
import { STYLE_LOOKS } from "@/lib/style-discovery";
import { RecommendationTaskBanner } from "@/components/recommendations/task-banner";
import {
  RecentWardrobePanel,
  RediscoverPanel,
} from "@/components/dashboard/wardrobe-panels";
import {
  OverviewMetrics,
  PendingLooksPanel,
  WeatherPanel,
  CarePanel,
  DailySetupPanel,
  WardrobeInsights,
  DashboardShortcuts,
  FamilyPanel,
} from "@/components/dashboard/dashboard-widgets";
import styles from "@/components/dashboard/dashboard-home.module.css";

const featuredLooks = STYLE_LOOKS.filter((look) =>
  ["streetBomber", "sportTrack", "retroArgyle", "frenchStripe"].includes(look.key),
);

export default function DashboardPage() {
  const { data: session } = useSession();
  const t = useTranslations("dashboard");
  const nav = useTranslations("nav");
  const analytics = useAnalytics();
  const recent = useItems(
    { is_archived: false, sort_by: "created_at", sort_order: "desc" },
    1,
    6,
  );
  const rediscover = useItems(
    { is_archived: false, sort_by: "wear_count", sort_order: "asc" },
    1,
    4,
  );
  const washing = useItems({ is_archived: false, needs_wash: true }, 1, 1);
  const tagging = useTaggingProgress();
  return (
    <div className={styles.dashboard}>
      <section className={styles.cover}>
        <div className={styles.coverCopy}>
          <p className={styles.kicker}>{t("editorial.eyebrow")}</p>
          <h1>{t("editorial.headline")}</h1>
          <p className={styles.coverSummary}>{t("editorial.summary")}</p>
          <div className={styles.coverActions}>
            <Button asChild>
              <Link href="/dashboard/inspiration">
                {t("editorial.discover")}
                <ArrowRight size={15} className="ml-2" aria-hidden="true" />
              </Link>
            </Button>
            <Link href="/dashboard/wardrobe" className={styles.coverSecondary}>
              {t("editorial.wardrobe")}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <nav className={styles.studioEntries} aria-label={nav("dailySection")}>
            {[
              { href: "/dashboard/wardrobe/tryon", label: nav("tryOn"), icon: ScanLine },
              { href: "/dashboard/wardrobe/3d", label: nav("closet3d"), icon: Shirt },
              { href: "/dashboard/wardrobe/avatar", label: nav("avatarStudio"), icon: UserRound },
            ].map(({ href, label, icon: Icon }) => (
              <Link href={href} key={href}>
                <Icon size={20} aria-hidden="true" />
                <span>{label}</span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            ))}
          </nav>
          <p className={styles.coverGreeting}>
            {t("welcomeBack", {
              name: session?.user?.name?.split(" ")[0] || t("userFallback"),
            })}
          </p>
        </div>
        <div className={styles.coverModel}>
          <LookSwitcher
            compact
            looks={featuredLooks.map((look) => ({
              ...look,
              name: t(`looks.discovery.lookNames.${look.key}`),
            }))}
            notice={t("looks.modelNotice")}
          />
          <Link href="/dashboard/looks" className={styles.modelEntry}>
            {t("looks.tabs.model")}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <OverviewMetrics
        inventory={recent.data?.total}
        inventoryLoading={recent.isLoading}
        inventoryError={recent.isError}
        analytics={analytics.data}
        analyticsLoading={analytics.isLoading}
        analyticsError={analytics.isError}
      />
      <InspirationTeasers />
      <div className={styles.workspace}>
        <div className={styles.primary}>
          <PendingLooksPanel />
          <RecentWardrobePanel
            items={recent.data?.items ?? []}
            total={recent.data?.total}
            isLoading={recent.isLoading}
            isError={recent.isError}
            onRetry={() => {
              void recent.refetch();
            }}
          />
          <RediscoverPanel
            items={rediscover.data?.items ?? []}
            isLoading={rediscover.isLoading}
            isError={rediscover.isError}
            onRetry={() => {
              void rediscover.refetch();
            }}
          />
        </div>
        <aside className={styles.aside}>
          <div className={styles.asideHeading}>
            <p className={styles.kicker}>{t("editorial.currentIssue")}</p>
            <h2>{t("editorial.serviceTitle")}</h2>
            <p>{t("editorial.serviceSubtitle")}</p>
          </div>
          <WeatherPanel />
          <CarePanel
            washingTotal={washing.data?.total}
            washingLoading={washing.isLoading}
            washingError={washing.isError}
            onRetryWashing={() => {
              void washing.refetch();
            }}
            tagging={tagging.data}
            taggingLoading={tagging.isLoading}
            taggingError={tagging.isError}
            onRetryTagging={() => {
              void tagging.refetch();
            }}
          />
          <DailySetupPanel />
          <div className={styles.taskRegion}>
            <RecommendationTaskBanner />
          </div>
          <FamilyPanel />
        </aside>
      </div>
      <WardrobeInsights
        analytics={analytics.data}
        isLoading={analytics.isLoading}
        isError={analytics.isError}
        onRetry={() => {
          void analytics.refetch();
        }}
      />
      <DashboardShortcuts />
      <footer className={styles.pageFootnote}>
        <span>{t("editorial.personalNote")}</span>
        <Link href="/dashboard/wardrobe">
          <Plus size={12} aria-hidden="true" />
          {t("quickActions.addNewItem")}
        </Link>
      </footer>
    </div>
  );
}
