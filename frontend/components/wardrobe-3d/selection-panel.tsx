"use client";

import {
  Heart,
  ArrowUpRight,
  Columns2,
  Plus,
  Check,
  Droplets,
  Expand,
} from "lucide-react";
import Link from "next/link";
import { fittingRoomHref } from "@/lib/fitting-seed";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Item } from "@/lib/types";
import { RackItemPhoto } from "./item-photo";
import styles from "./workspace.module.css";

export function RackSelectionPanel({
  item,
  name,
  typeLabel,
  inTray,
  compared,
  compareFull,
  trayFull,
  canUse,
  busy,
  onFavorite,
  onDetails,
  onCompare,
  onTray,
  photoCount,
  onInspectPhotos,
}: {
  item: Item;
  name: string;
  typeLabel: string;
  inTray: boolean;
  compared: boolean;
  compareFull: boolean;
  trayFull: boolean;
  canUse: boolean;
  busy: boolean;
  onFavorite(): void;
  onDetails(): void;
  onCompare(): void;
  onTray(): void;
  photoCount: number;
  onInspectPhotos(): void;
}) {
  const t = useTranslations("wardrobe.rack");
  const tf = useTranslations("wardrobe.fitting");
  const tryOnHref = fittingRoomHref([item]);
  return (
    <aside className={styles.selection} aria-label={t("selectedLabel")}>
      <div className={styles.selectionHeader}>
        <span>{t("selectedLabel")}</span>
        <button
          type="button"
          className={styles.favoriteButton}
          aria-label={t(item.favorite ? "unfavorite" : "favorite")}
          aria-pressed={item.favorite}
          disabled={busy}
          onClick={onFavorite}
        >
          <Heart
            size={19}
            fill={item.favorite ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </button>
      </div>
      <button
        type="button"
        className={styles.inspectPhoto}
        disabled={!photoCount}
        onClick={onInspectPhotos}
        aria-label={`${t("inspectPhotos")} · ${t("photoCount", { count: photoCount })}`}
      >
        <RackItemPhoto item={item} name={name} />
        <span>
          <Expand size={13} aria-hidden="true" />
          {t("inspectPhotos")} · {t("photoCount", { count: photoCount })}
        </span>
      </button>
      <div className={styles.selectionCopy}>
        <span className={styles.category}>
          {typeLabel}
          {item.brand ? ` / ${item.brand}` : ""}
        </span>
        <h2>{name}</h2>
        <div className={styles.itemMeta}>
          <span>{t("wearCount", { count: item.wear_count || 0 })}</span>
          <span data-wash={item.needs_wash || undefined}>
            {item.needs_wash && <Droplets size={12} aria-hidden="true" />}
            {t(item.needs_wash ? "needsWash" : "clean")}
          </span>
        </div>
        <div className={styles.actionPair}>
          <Button
            variant="outline"
            onClick={onCompare}
            disabled={compareFull && !compared}
            aria-pressed={compared}
          >
            <Columns2 size={15} aria-hidden="true" />
            {t(compared ? "removeCompare" : "compare")}
          </Button>
          <Button onClick={onTray} disabled={!inTray && (!canUse || trayFull)}>
            {inTray ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <Plus size={15} aria-hidden="true" />
            )}
            {t(inTray ? "inTray" : "addToTray")}
          </Button>
        </div>
        {tryOnHref && (
          <Button asChild variant="outline" className={styles.tryOnLink}>
            <Link href={tryOnHref}>
              {tf("directTryOn")}
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </Button>
        )}
        {!canUse && <p className={styles.hint}>{t("trayUnavailable")}</p>}
        {trayFull && !inTray && <p className={styles.hint}>{t("fullTray")}</p>}
        <button
          type="button"
          className={styles.detailsLink}
          onClick={onDetails}
        >
          {t("showDetails")}
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
