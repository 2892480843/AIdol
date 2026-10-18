"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Box, Grid2X2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ItemDetailDialog } from "@/components/item-detail-dialog";
import { useItem, useUpdateItem } from "@/lib/hooks/use-items";
import { useWardrobe3D } from "@/lib/hooks/use-wardrobe-3d";
import { useTypeLabel } from "@/lib/hooks/use-translated-constants";
import {
  DEFAULT_RACK_FILTERS,
  filterRackItems,
  rackItemColor,
  rackWindow,
} from "@/lib/wardrobe-3d";
import { isInspirationItemEligible } from "@/lib/inspiration/matching";
import { buildInspirationStudioUrl } from "@/lib/studio/inspiration-seed";
import type { Item } from "@/lib/types";
import {
  useWardrobeDraft,
  useWardrobeDraftItems,
} from "@/lib/hooks/use-wardrobe-draft";
import { fittingRoomHref } from "@/lib/fitting-seed";
import { MAX_RACK_DRAFT_ITEMS } from "@/lib/wardrobe-draft";
import { useLightbox } from "@/lib/lightbox-context";
import { itemToLightboxImages } from "@/lib/lightbox-adapters";
import { RackScenePanel } from "./rack-scene-panel";
import { RackFiltersBar } from "./filters";
import { RackItemPhoto } from "./item-photo";
import { RackSelectionPanel } from "./selection-panel";
import { RackComparison, RackTray } from "./item-collections";
import styles from "./workspace.module.css";

export function Wardrobe3DWorkspace() {
  const t = useTranslations("wardrobe.rack");
  const ta = useTranslations("wardrobe.avatar");
  const wardrobe = useWardrobe3D();
  const typeLabel = useTypeLabel();
  const update = useUpdateItem();
  const [filters, setFilters] = useState(DEFAULT_RACK_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const draft = useWardrobeDraft();
  const draftReady =
    draft.hydrated && !!wardrobe.owner && draft.owner === wardrobe.owner;
  const trayIds = draftReady ? draft.ids : [];
  const resolved = useWardrobeDraftItems(
    draftReady ? wardrobe.owner : null,
    trayIds,
  );
  const { open: openPhotos } = useLightbox();
  const [detailOpen, setDetailOpen] = useState(false);
  const label = useCallback(
    (item: Item) => item.name || typeLabel(item.type),
    [typeLabel],
  );
  const items = useMemo(
    () =>
      wardrobe.owner
        ? wardrobe.items.filter((item) => item.user_id === wardrobe.owner)
        : [],
    [wardrobe.items, wardrobe.owner],
  );
  const filtered = useMemo(
    () => filterRackItems(items, filters, label),
    [items, filters, label],
  );
  const selected =
    filtered.find((item) => item.id === selectedId) || filtered[0];
  const activeId = selected?.id || null;
  const detailQuery = useItem(detailOpen ? activeId || "" : "");
  const detailItem =
    detailQuery.data?.id === activeId &&
    detailQuery.data?.user_id === wardrobe.owner
      ? detailQuery.data
      : selected;
  const activeIndex = filtered.findIndex((item) => item.id === activeId);
  const windowItems = useMemo(
    () => rackWindow(filtered, activeId),
    [filtered, activeId],
  );
  const sceneItems = useMemo(
    () =>
      windowItems.map((item) => ({
        id: item.id,
        type: item.type,
        color: rackItemColor(item),
        name: label(item),
      })),
    [windowItems, label],
  );
  const comparison = compareIds.flatMap(
    (id) => items.find((item) => item.id === id) || [],
  );
  const tray = resolved.entries.flatMap((entry) =>
    entry.state === "ready" && entry.item?.user_id === wardrobe.owner
      ? [entry.item]
      : [],
  );
  const photos = selected
    ? itemToLightboxImages({
        id: selected.id,
        image_url: selected.image_url,
        medium_url: selected.medium_url,
        thumbnail_url: selected.thumbnail_url,
        additional_images: selected.additional_images,
        name: label(selected),
        category: typeLabel(selected.type),
      }).images
    : [];
  let studioHref: string | null = null;
  if (
    draftReady &&
    tray.length === trayIds.length &&
    tray.length &&
    !resolved.isLoading &&
    !resolved.hasErrors &&
    tray.every(isInspirationItemEligible)
  ) {
    try {
      studioHref = buildInspirationStudioUrl(
        tray.map((item) => item.id),
        "casual",
        t("studioName"),
      );
    } catch {
      /* Invalid IDs never become a broken editor link. */
    }
  }
  useEffect(() => {
    setSelectedId(null);
    setCompareIds([]);
    setDetailOpen(false);
    setFilters(DEFAULT_RACK_FILTERS);
  }, [wardrobe.owner]);
  const move = (direction: number) => {
    if (!filtered.length) return;
    setSelectedId(
      filtered[(activeIndex + direction + filtered.length) % filtered.length]
        .id,
    );
  };
  const favorite = async () => {
    if (!selected || update.isPending) return;
    try {
      await update.mutateAsync({
        id: selected.id,
        data: { favorite: !selected.favorite },
      });
      await wardrobe.refetch();
    } catch {
      toast.error(t("favoriteError"));
    }
  };
  const toggleCompare = () => {
    if (!activeId) return;
    setCompareIds((ids) => {
      const current = ids.filter((id) => items.some((item) => item.id === id));
      return current.includes(activeId)
        ? current.filter((id) => id !== activeId)
        : current.length < 2
          ? [...current, activeId]
          : current;
    });
  };
  const toggleTray = () => {
    if (!selected || !draftReady) return;
    if (trayIds.includes(selected.id) || isInspirationItemEligible(selected))
      draft.toggle(selected.id);
  };
  return (
    <div className={styles.workspace}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>
            <Box size={15} aria-hidden="true" />
            {t("eyebrow")}
          </p>
          <h1>{t("title")}</h1>
          <p className={styles.description}>{t("description")}</p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.backLink} href="/dashboard/wardrobe/avatar">
            <Box size={15} aria-hidden="true" />
            {ta("modelLabel")}
          </Link>
          <Link className={styles.backLink} href="/dashboard/wardrobe">
            <Grid2X2 size={15} aria-hidden="true" />
            {t("backToGrid")}
          </Link>
        </div>
      </header>
      <RackFiltersBar value={filters} onChange={setFilters} />
      <div className={styles.inventoryMeta}>
        <span>
          {t("loadedCount", { loaded: items.length, total: wardrobe.total })}
        </span>
        <span role="status" aria-live="polite">
          {t("filteredCount", { count: filtered.length })}
        </span>
      </div>
      {wardrobe.hasMore && <p className={styles.hint}>{t("partialHint")}</p>}
      {wardrobe.isError && items.length > 0 && (
        <div role="alert" className={styles.partialError}>
          <p>{t("partialError")}</p>
          <Button variant="outline" onClick={() => void wardrobe.refetch()}>
            {t("retry")}
          </Button>
        </div>
      )}
      {wardrobe.isLoading || !wardrobe.owner ? (
        <div className={styles.state}>
          <Loader2 size={24} className="animate-spin" aria-hidden="true" />
          <p>{t("loading")}</p>
        </div>
      ) : wardrobe.isError && !items.length ? (
        <div className={styles.state} role="alert">
          <p>{t("error")}</p>
          <Button onClick={() => void wardrobe.refetch()}>{t("retry")}</Button>
        </div>
      ) : !filtered.length ? (
        <div className={styles.state}>
          <h2>{t("emptyTitle")}</h2>
          <p>{t("emptyDescription")}</p>
          <Button
            variant="outline"
            onClick={() => setFilters(DEFAULT_RACK_FILTERS)}
          >
            {t("resetFilters")}
          </Button>
          <Link href="/dashboard/wardrobe">{t("addItem")}</Link>
        </div>
      ) : (
        selected && (
          <>
            <div className={styles.showroom}>
              <RackScenePanel
                key={wardrobe.owner}
                items={sceneItems}
                photoItems={windowItems}
                selected={selected}
                name={label(selected)}
                activeIndex={activeIndex}
                total={filtered.length}
                onSelect={setSelectedId}
                onMove={move}
              />
              <RackSelectionPanel
                item={selected}
                name={label(selected)}
                typeLabel={typeLabel(selected.type)}
                compared={compareIds.includes(selected.id)}
                inTray={trayIds.includes(selected.id)}
                compareFull={comparison.length >= 2}
                trayFull={trayIds.length >= MAX_RACK_DRAFT_ITEMS}
                canUse={draftReady && isInspirationItemEligible(selected)}
                busy={update.isPending}
                onCompare={toggleCompare}
                onTray={toggleTray}
                onDetails={() => setDetailOpen(true)}
                onFavorite={() => void favorite()}
                photoCount={photos.length}
                onInspectPhotos={() => {
                  if (photos.length) openPhotos(photos, 0, selected.id);
                }}
              />
            </div>
            <p className={styles.modelNotice}>{t("modelNotice")}</p>
            <ul className={styles.inventoryList}>
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-label={t("chooseItem", { name: label(item) })}
                    aria-pressed={item.id === activeId}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <RackItemPhoto item={item} name={label(item)} small />
                    <span>
                      <strong>{label(item)}</strong>
                      <small>{typeLabel(item.type)}</small>
                    </span>
                    <span
                      className={styles.swatch}
                      style={{ background: rackItemColor(item) }}
                    />
                  </button>
                </li>
              ))}
            </ul>
            <RackComparison
              items={comparison}
              label={label}
              onRemove={(id) =>
                setCompareIds((ids) => ids.filter((q) => q !== id))
              }
              onClear={() => setCompareIds([])}
            />
            <ItemDetailDialog
              item={detailItem || null}
              open={detailOpen}
              onOpenChange={(open) => {
                setDetailOpen(open);
                if (!open) void wardrobe.refetch();
              }}
            />
          </>
        )
      )}
      {draftReady && (
        <RackTray
          entries={resolved.entries}
          label={label}
          href={studioHref}
          tryOnHref={studioHref ? fittingRoomHref(tray) : null}
          storageAvailable={draft.storageAvailable}
          loading={resolved.isLoading}
          hasErrors={resolved.hasErrors}
          onRetry={() => void resolved.retry()}
          onRemove={draft.remove}
          onClear={draft.clear}
        />
      )}
      {wardrobe.hasMore && !wardrobe.isLoading && (
        <div className={styles.loadMore}>
          <Button
            variant="outline"
            disabled={wardrobe.isFetching}
            onClick={() => void wardrobe.loadMore()}
          >
            {t(wardrobe.isFetchingMore ? "loadingMore" : "loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
