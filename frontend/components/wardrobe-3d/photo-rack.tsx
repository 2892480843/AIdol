"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import type { Item } from "@/lib/types";
import { RackItemPhoto } from "./item-photo";
import styles from "./workspace.module.css";

/** Original photographs preserve garment details; this display does not reconstruct garment geometry. */
export function PhotoRack({
  items,
  selectedId,
  name,
  onSelect,
}: {
  items: Item[];
  selectedId: string;
  name(item: Item): string;
  onSelect(id: string): void;
}) {
  const t = useTranslations("wardrobe.rack");
  const center = items.findIndex((item) => item.id === selectedId);
  return (
    <div className={styles.photoRail}>
      <div className={styles.photoRailRod} aria-hidden="true" />
      {items.map((item, index) => {
        const offset = index - center;
        if (center < 0 || Math.abs(offset) > 2) return null;
        return (
          <button
            type="button"
            key={item.id}
            className={styles.photoRailPiece}
            style={
              {
                "--rail-offset": offset,
                zIndex: 3 - Math.abs(offset),
              } as CSSProperties
            }
            aria-label={t("photoRailChoose", { name: name(item) })}
            aria-pressed={offset === 0}
            tabIndex={Math.abs(offset) > 1 ? -1 : 0}
            onClick={() => onSelect(item.id)}
          >
            <svg
              viewBox="0 0 200 74"
              className={styles.photoHanger}
              aria-hidden="true"
            >
              <path
                d="M100 25V18c0-12 18-12 18-1 0 6-8 8-14 13L22 63q-10 7 1 7h154q11 0 1-7l-74-33"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <RackItemPhoto item={item} name={name(item)} />
            <span className={styles.photoRailName}>{name(item)}</span>
          </button>
        );
      })}
      <p className={styles.photoRailNotice}>{t("photoRailNotice")}</p>
    </div>
  );
}
