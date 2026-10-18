"use client";

import { Checkbox, NativeSelect, TextInput } from "@mantine/core";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  RACK_GROUPS,
  type RackFilters,
  type RackSort,
  type RackWash,
} from "@/lib/wardrobe-3d";
import styles from "./workspace.module.css";

export function RackFiltersBar({
  value,
  onChange,
}: {
  value: RackFilters;
  onChange(value: RackFilters): void;
}) {
  const t = useTranslations("wardrobe.rack");
  return (
    <div className={styles.filters}>
      <div className={styles.groups} role="group" aria-label={t("groupLabel")}>
        {RACK_GROUPS.map((group) => (
          <button
            type="button"
            key={group}
            aria-pressed={value.group === group}
            onClick={() => onChange({ ...value, group })}
          >
            {t(`groups.${group}`)}
          </button>
        ))}
      </div>
      <div className={styles.filterFields}>
        <TextInput
          label={t("searchLabel")}
          placeholder={t("searchPlaceholder")}
          leftSection={<Search size={16} aria-hidden="true" />}
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.currentTarget.value })}
        />
        <NativeSelect
          label={t("washLabel")}
          value={value.wash}
          onChange={(e) =>
            onChange({ ...value, wash: e.currentTarget.value as RackWash })
          }
          data={["all", "clean", "wash"].map((key) => ({
            value: key,
            label: t(`washOptions.${key}`),
          }))}
        />
        <NativeSelect
          label={t("sortLabel")}
          value={value.sort}
          onChange={(e) =>
            onChange({ ...value, sort: e.currentTarget.value as RackSort })
          }
          data={["newest", "leastWorn", "color"].map((key) => ({
            value: key,
            label: t(`sortOptions.${key}`),
          }))}
        />
        <Checkbox
          className={styles.favoriteFilter}
          label={t("favoritesOnly")}
          checked={value.favoritesOnly}
          onChange={(e) =>
            onChange({ ...value, favoritesOnly: e.currentTarget.checked })
          }
        />
      </div>
    </div>
  );
}
