"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Badge,
  Button,
  Paper,
  Skeleton,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  AlertCircle,
  Archive,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Shirt,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useTypeLabel } from "@/lib/hooks/use-translated-constants";
import type { Item } from "@/lib/types";
import styles from "./wardrobe-panels.module.css";

interface PanelProps {
  items: Item[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

interface RecentWardrobePanelProps extends PanelProps {
  total: number | undefined;
}

function itemLink(
  route: "/dashboard/wardrobe" | "/dashboard/suggest",
  id: string,
) {
  return `${route}?${new URLSearchParams({ item: id })}`;
}

function GarmentImage({
  item,
  name,
  compact = false,
}: {
  item: Item;
  name: string;
  compact?: boolean;
}) {
  const t = useTranslations("dashboard.overview");
  const src =
    item.thumbnail_url?.trim() ||
    item.image_url?.trim() ||
    item.medium_url?.trim();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <div className={styles.imageFallback}>
        <Shirt size={compact ? 20 : 28} strokeWidth={1.4} aria-hidden="true" />
        <span
          className={compact ? styles.visuallyHidden : styles.imageFallbackText}
        >
          {t("imageUnavailable")}
        </span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={name}
      fill
      className={styles.image}
      sizes={
        compact
          ? "64px"
          : "(min-width: 1280px) 220px, (min-width: 640px) 30vw, 45vw"
      }
      onError={() => setFailed(true)}
    />
  );
}

const STATUS = {
  ready: { key: "itemStatusReady", color: "forest", Icon: CheckCircle2 },
  processing: { key: "itemStatusProcessing", color: "blue", Icon: Loader2 },
  error: { key: "itemStatusError", color: "red", Icon: AlertCircle },
  archived: { key: "itemStatusArchived", color: "gray", Icon: Archive },
} as const;

function RecentItem({ item }: { item: Item }) {
  const t = useTranslations("dashboard.overview");
  const typeLabel = useTypeLabel();
  const name = item.name?.trim() || typeLabel(item.type);
  const status = item.is_archived ? "archived" : item.status;
  const { key, color, Icon } = STATUS[status];
  const descriptionId = useId();

  return (
    <UnstyledButton
      component={Link}
      href={itemLink("/dashboard/wardrobe", item.id)}
      className={styles.recentItem}
      aria-label={name}
      aria-describedby={descriptionId}
    >
      <div className={styles.recentImage}>
        <GarmentImage item={item} name={name} />
        <Badge
          size="xs"
          variant="light"
          color={color}
          radius="xl"
          className={styles.status}
          leftSection={
            <Icon
              size={11}
              aria-hidden="true"
              className={status === "processing" ? styles.spinning : undefined}
            />
          }
        >
          {t(key)}
        </Badge>
      </div>
      <div className={styles.itemCaption}>
        <Text component="h3" className={styles.itemName} lineClamp={1}>
          {name}
        </Text>
        <Text component="span" id={descriptionId} className={styles.itemType}>
          {typeLabel(item.type)}
          <span className={styles.visuallyHidden}>, {t(key)}</span>
        </Text>
      </div>
    </UnstyledButton>
  );
}

function PanelBody({
  isLoading,
  isError,
  isEmpty,
  onRetry,
  variant,
  children,
}: Omit<PanelProps, "items"> & {
  isEmpty: boolean;
  variant: "recent" | "rediscover";
  children: ReactNode;
}) {
  const t = useTranslations("dashboard.overview");
  const tc = useTranslations("common");
  const tw = useTranslations("wardrobe");

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label={tc("loading")}
        aria-busy="true"
        className={
          variant === "recent" ? styles.recentGrid : styles.rediscoverList
        }
      >
        {Array.from({ length: variant === "recent" ? 6 : 4 }, (_, index) =>
          variant === "recent" ? (
            <div key={index} aria-hidden="true">
              <Skeleton className={styles.recentSkeleton} radius={0} />
              <Skeleton height={12} width="70%" mt={12} />
              <Skeleton height={9} width="40%" mt={8} />
            </div>
          ) : (
            <div key={index} className={styles.skeletonRow} aria-hidden="true">
              <Skeleton width={56} height={70} radius={0} />
              <div>
                <Skeleton height={12} width="65%" />
                <Skeleton height={10} width="40%" mt={10} />
              </div>
            </div>
          ),
        )}
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.feedback} role="alert">
        <span className={styles.feedbackIcon}>
          <AlertCircle size={22} aria-hidden="true" />
        </span>
        <Text size="sm" c="dimmed">
          {t("dataError")}
        </Text>
        <Button
          variant="light"
          size="xs"
          radius={0}
          leftSection={<RefreshCw size={14} aria-hidden="true" />}
          onClick={() => onRetry()}
        >
          {t("refresh")}
        </Button>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className={styles.feedback}>
        <span className={styles.feedbackIcon}>
          <Shirt size={24} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <Text fw={600} size="sm">
          {t("wardrobeEmptyTitle")}
        </Text>
        <Text size="sm" c="dimmed" className={styles.emptyDescription}>
          {t("wardrobeEmptyDescription")}
        </Text>
        <Button
          component={Link}
          href="/dashboard/wardrobe"
          variant="light"
          size="xs"
          radius={0}
          leftSection={<Plus size={14} aria-hidden="true" />}
        >
          {tw("actions.addItem")}
        </Button>
      </div>
    );
  }

  return children;
}

export function RecentWardrobePanel({
  items,
  total,
  isLoading,
  isError,
  onRetry,
}: RecentWardrobePanelProps) {
  const t = useTranslations("dashboard.overview");
  const tc = useTranslations("common");
  const titleId = useId();

  return (
    <Paper
      component="section"
      withBorder
      radius={0}
      className={styles.panel}
      aria-labelledby={titleId}
    >
      <div className={styles.panelHeader}>
        <div className={styles.panelHeading}>
          <Title order={2} id={titleId} className={styles.title}>
            {t("recentTitle")}
          </Title>
          <Text size="sm" c="dimmed" className={styles.description}>
            {t("recentDescription")}
          </Text>
          {total !== undefined && (
            <Text component="span" className={styles.total}>
              {t("wardrobeTotal", { count: total })}
            </Text>
          )}
        </div>
        <Button
          component={Link}
          href="/dashboard/wardrobe"
          variant="subtle"
          size="compact-xs"
          radius={0}
          rightSection={<ArrowRight size={14} aria-hidden="true" />}
          className={styles.viewAll}
        >
          {tc("viewAll")}
        </Button>
      </div>
      <PanelBody
        isLoading={isLoading}
        isError={isError}
        isEmpty={items.length === 0}
        onRetry={onRetry}
        variant="recent"
      >
        <div className={styles.recentGrid}>
          {items.slice(0, 6).map((item) => (
            <RecentItem key={item.id} item={item} />
          ))}
        </div>
      </PanelBody>
    </Paper>
  );
}

function RediscoverItem({ item }: { item: Item }) {
  const t = useTranslations("dashboard.overview");
  const tw = useTranslations("wardrobe");
  const typeLabel = useTypeLabel();
  const name = item.name?.trim() || typeLabel(item.type);
  const canSuggest = item.status === "ready" && !item.is_archived;
  const status = item.is_archived ? "archived" : item.status;
  const statusId = useId();
  const actionProps = {
    "aria-label": `${t("rediscoverAction")}: ${name}`,
    variant: "light" as const,
    size: "xs",
    radius: 10,
    rightSection: <ArrowUpRight size={13} aria-hidden="true" />,
    className: styles.styleAction,
  };

  return (
    <div className={styles.rediscoverRow}>
      <UnstyledButton
        component={Link}
        href={itemLink("/dashboard/wardrobe", item.id)}
        className={styles.rediscoverItem}
        aria-label={name}
      >
        <div className={styles.rediscoverImage}>
          <GarmentImage item={item} name={name} compact />
        </div>
        <div className={styles.rediscoverMeta}>
          <Text component="h3" lineClamp={1} className={styles.itemName}>
            {name}
          </Text>
          <Text component="span" className={styles.itemType}>
            {typeLabel(item.type)}
            {!canSuggest && (
              <>
                {" · "}
                <span id={statusId}>{t(STATUS[status].key)}</span>
              </>
            )}
          </Text>
          <Text size="xs" className={styles.wearCount}>
            {tw("wearCount", { count: item.wear_count })}
          </Text>
        </div>
      </UnstyledButton>
      {canSuggest ? (
        <Button
          {...actionProps}
          component={Link}
          href={itemLink("/dashboard/suggest", item.id)}
        >
          {t("rediscoverAction")}
        </Button>
      ) : (
        <Button {...actionProps} disabled aria-describedby={statusId}>
          {t("rediscoverAction")}
        </Button>
      )}
    </div>
  );
}

export function RediscoverPanel({
  items,
  isLoading,
  isError,
  onRetry,
}: PanelProps) {
  const t = useTranslations("dashboard.overview");
  const titleId = useId();

  return (
    <Paper
      component="section"
      withBorder
      radius={0}
      className={`${styles.panel} ${styles.rediscoverPanel}`}
      aria-labelledby={titleId}
    >
      <div className={styles.panelHeader}>
        <div className={styles.panelHeading}>
          <Title order={2} id={titleId} className={styles.title}>
            {t("rediscoverTitle")}
          </Title>
          <Text size="sm" c="dimmed" className={styles.description}>
            {t("rediscoverDescription")}
          </Text>
        </div>
      </div>
      <PanelBody
        isLoading={isLoading}
        isError={isError}
        isEmpty={items.length === 0}
        onRetry={onRetry}
        variant="rediscover"
      >
        <div className={styles.rediscoverList}>
          {items.slice(0, 4).map((item) => (
            <RediscoverItem key={item.id} item={item} />
          ))}
        </div>
      </PanelBody>
    </Paper>
  );
}
