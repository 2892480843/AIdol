"use client";

import { useState } from "react";
import Image from "next/image";
import { Select } from "@mantine/core";
import { Shirt, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useTypeLabel } from "@/lib/hooks/use-translated-constants";
import type { Item } from "@/lib/types";
import styles from "./anchor-picker.module.css";

type AnchorPickerProps = {
  items: Item[];
  value: string | null;
  selectedItem: Item | null;
  compatibleCount: number;
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  total: number;
  creatorReset: boolean;
  showInventoryControls: boolean;
  onChange: (id: string | null) => void;
  onRetry: () => void;
  onLoadMore: () => void;
};

function AnchorImage({ item, label }: { item: Item; label: string }) {
  const [failed, setFailed] = useState(false);
  const src = item.thumbnail_url || item.image_url;
  return src && !failed ? (
    <Image
      src={src}
      alt={label}
      fill
      sizes="72px"
      onError={() => setFailed(true)}
    />
  ) : (
    <Shirt size={26} aria-hidden="true" />
  );
}

export function AnchorPicker({
  items,
  value,
  selectedItem,
  compatibleCount,
  isLoading,
  isError,
  hasMore,
  isFetchingMore,
  total,
  creatorReset,
  showInventoryControls,
  onChange,
  onRetry,
  onLoadMore,
}: AnchorPickerProps) {
  const t = useTranslations("dashboard.inspiration");
  const typeLabel = useTypeLabel();
  const name = selectedItem
    ? selectedItem.name || typeLabel(selectedItem.type)
    : "";
  const unavailable = !!value && !selectedItem && !isLoading;
  return (
    <section
      id="one-piece-many-looks"
      className={styles.panel}
      aria-labelledby="anchor-title"
    >
      <div className={styles.heading}>
        <span className={styles.icon}>
          <Sparkles size={21} aria-hidden="true" />
        </span>
        <div>
          <h2 id="anchor-title">{t("anchor.title")}</h2>
          <p>{t("anchor.description")}</p>
        </div>
      </div>
      <div className={styles.controls}>
        <Select
          className={styles.select}
          label={t("anchor.choose")}
          placeholder={t("anchor.allItems")}
          value={selectedItem ? value : null}
          searchable
          allowDeselect={false}
          disabled={isLoading || isError || !items.length}
          nothingFoundMessage={t("anchor.empty")}
          data={items.map((item) => ({
            value: item.id,
            label: item.name || typeLabel(item.type),
          }))}
          onChange={onChange}
        />
        {value && (
          <Button size="sm" variant="outline" onClick={() => onChange(null)}>
            {t("anchor.clear")}
          </Button>
        )}
      </div>
      {selectedItem && (
        <div className={styles.selected}>
          <span className={styles.photo}>
            <AnchorImage
              key={`${selectedItem.id}:${selectedItem.thumbnail_url || selectedItem.image_url}`}
              item={selectedItem}
              label={name}
            />
          </span>
          <div className={styles.selectedCopy}>
            <strong>{name}</strong>
            <span>{typeLabel(selectedItem.type)}</span>
            <p role="status">
              {t("anchor.compatibleCount", { count: compatibleCount })}
            </p>
          </div>
        </div>
      )}
      <div className={styles.notes}>
        {isLoading ? (
          <p role="status">{t("anchor.loading")}</p>
        ) : isError ? (
          showInventoryControls && (
            <div className={styles.inlineNotice} role="status">
              <p>{t("inventoryError")}</p>
              <Button size="sm" variant="ghost" onClick={onRetry}>
                {t("retry")}
              </Button>
            </div>
          )
        ) : unavailable ? (
          <p className={styles.unavailable} role="status">
            {t("anchor.unavailable")}
          </p>
        ) : !items.length ? (
          <p role="status">{t("anchor.empty")}</p>
        ) : null}
        {creatorReset && <p role="status">{t("anchor.creatorReset")}</p>}
        {hasMore && !isLoading && (
          <div className={styles.inlineNotice}>
            <p>{t("anchor.partial", { loaded: items.length, total })}</p>
            {showInventoryControls && (
              <Button
                variant="ghost"
                size="sm"
                disabled={isFetchingMore || isError}
                onClick={onLoadMore}
              >
                {t(isFetchingMore ? "loadingMore" : "loadMore")}
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
