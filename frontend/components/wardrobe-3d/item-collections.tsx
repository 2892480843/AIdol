"use client";

import Link from "next/link";
import { ArrowUpRight, X, ShoppingBag, Loader2, PackageX } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Item } from "@/lib/types";
import { useColorLabel } from "@/lib/hooks/use-translated-constants";
import { rackItemColor } from "@/lib/wardrobe-3d";
import { RackItemPhoto } from "./item-photo";
import styles from "./workspace.module.css";

export function RackComparison({
  items,
  label,
  onRemove,
  onClear,
}: {
  items: Item[];
  label(item: Item): string;
  onRemove(id: string): void;
  onClear(): void;
}) {
  const t = useTranslations("wardrobe.rack");
  const colorLabel = useColorLabel();
  if (!items.length) return null;
  return (
    <section
      className={styles.comparison}
      role="region"
      aria-label={t("compareTitle")}
    >
      <div className={styles.sectionHeader}>
        <h2>
          {t("compareTitle")} <span>{items.length} / 2</span>
        </h2>
        <button type="button" onClick={onClear}>
          {t("clearCompare")}
        </button>
      </div>
      <div className={styles.comparisonItems}>
        {items.map((item) => (
          <article key={item.id}>
            <RackItemPhoto item={item} name={label(item)} />
            <div>
              <h3>{label(item)}</h3>
              <p>
                <span
                  className={styles.swatch}
                  style={{ background: rackItemColor(item) }}
                />
                {item.primary_color || item.colors?.[0]
                  ? colorLabel(item.primary_color || item.colors[0])
                  : "—"}
              </p>
              <p>
                {t("wearCount", { count: item.wear_count || 0 })} ·{" "}
                {t(item.needs_wash ? "needsWash" : "clean")}
              </p>
            </div>
            <button
              type="button"
              aria-label={t("removeItem", { name: label(item) })}
              onClick={() => onRemove(item.id)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>
      {items.length < 2 && <p className={styles.hint}>{t("compareHint")}</p>}
    </section>
  );
}

export function RackTray({
  entries,
  label,
  href,
  tryOnHref,
  storageAvailable,
  loading,
  hasErrors,
  onRetry,
  onRemove,
  onClear,
}: {
  entries: Array<{
    id: string;
    item: Item | null;
    state: "loading" | "ready" | "unavailable" | "error";
  }>;
  label(item: Item): string;
  href: string | null;
  tryOnHref?: string | null;
  storageAvailable: boolean;
  loading: boolean;
  hasErrors: boolean;
  onRetry(): void;
  onRemove(id: string): void;
  onClear(): void;
}) {
  const t = useTranslations("wardrobe.rack");
  const tf = useTranslations("wardrobe.fitting");
  const unavailable = entries.filter((entry) => entry.state === "unavailable");
  return (
    <section className={styles.tray} role="region" aria-label={t("trayTitle")}>
      <div className={styles.sectionHeader}>
        <h2>
          <ShoppingBag size={18} aria-hidden="true" />
          {t("trayTitle")}{" "}
          <span>{t("trayCount", { count: entries.length })}</span>
        </h2>
        {entries.length > 0 && (
          <button type="button" onClick={onClear}>
            {t("clearTray")}
          </button>
        )}
      </div>
      <p className={styles.hint}>{t("trayHint")}</p>
      <p className={styles.hint}>
        {t(storageAvailable ? "localDraftHint" : "draftStorageError")}
      </p>
      {entries.length > 0 && (
        <ul className={styles.trayItems}>
          {entries.map((entry) => {
            const item = entry.state === "ready" ? entry.item : null;
            const name = item
              ? label(item)
              : t(
                  entry.state === "unavailable"
                    ? "draftMissingItem"
                    : entry.state === "error"
                      ? "draftLoadError"
                      : "draftLoading",
                );
            return (
              <li key={entry.id}>
                {item ? (
                  <RackItemPhoto item={item} name={name} small />
                ) : (
                  <span className={styles.draftPlaceholder} aria-hidden="true">
                    {entry.state === "loading" ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <PackageX size={18} />
                    )}
                  </span>
                )}
                <span>{name}</span>
                <button
                  type="button"
                  aria-label={t("removeItem", { name })}
                  onClick={() => onRemove(entry.id)}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {loading && (
        <p className={styles.hint} role="status">
          {t("draftLoading")}
        </p>
      )}
      {hasErrors && (
        <div className={styles.draftActions} role="alert">
          <p className={styles.hint}>{t("draftLoadError")}</p>
          <Button variant="outline" onClick={onRetry}>
            {t("retryDraft")}
          </Button>
        </div>
      )}
      {unavailable.length > 0 && (
        <div className={styles.draftActions}>
          <p className={styles.hint}>{t("draftUnavailable")}</p>
          <Button
            variant="outline"
            onClick={() => unavailable.forEach((entry) => onRemove(entry.id))}
          >
            {t("removeUnavailable")}
          </Button>
        </div>
      )}
      {href ? (
        <Button asChild>
          <Link href={href}>
            {t("openStudio")}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </Button>
      ) : (
        entries.length > 0 &&
        !loading &&
        !hasErrors &&
        !unavailable.length && (
          <p className={styles.hint}>{t("trayUnavailable")}</p>
        )
      )}
      {tryOnHref && (
        <Button asChild variant="outline">
          <Link href={tryOnHref}>
            {tf("outfitTryOn")}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </Button>
      )}
    </section>
  );
}
