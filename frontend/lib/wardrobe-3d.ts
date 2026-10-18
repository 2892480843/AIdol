import { colorSwatch } from "@/lib/colors";
import type { Item } from "@/lib/types";

export const RACK_GROUPS = [
  "all",
  "tops",
  "outerwear",
  "bottoms",
  "dresses",
  "shoes",
  "accessories",
  "other",
] as const;
export type RackGroup = (typeof RACK_GROUPS)[number];
export type RackSort = "newest" | "leastWorn" | "color";
export type RackWash = "all" | "clean" | "wash";
export type RackFilters = {
  group: RackGroup;
  query: string;
  favoritesOnly: boolean;
  wash: RackWash;
  sort: RackSort;
};
export const DEFAULT_RACK_FILTERS: RackFilters = {
  group: "all",
  query: "",
  favoritesOnly: false,
  wash: "all",
  sort: "newest",
};

const TYPE_GROUPS: Record<string, Exclude<RackGroup, "all">> = {
  shirt: "tops",
  "t-shirt": "tops",
  top: "tops",
  sweater: "tops",
  hoodie: "tops",
  polo: "tops",
  blouse: "tops",
  "tank-top": "tops",
  jacket: "outerwear",
  coat: "outerwear",
  blazer: "outerwear",
  suit: "outerwear",
  vest: "outerwear",
  cardigan: "outerwear",
  pants: "bottoms",
  jeans: "bottoms",
  shorts: "bottoms",
  skirt: "bottoms",
  dress: "dresses",
  jumpsuit: "dresses",
  shoes: "shoes",
  sneakers: "shoes",
  boots: "shoes",
  sandals: "shoes",
  socks: "accessories",
  tights: "accessories",
  tie: "accessories",
  hat: "accessories",
  scarf: "accessories",
  belt: "accessories",
  bag: "accessories",
  accessories: "accessories",
};

export function rackGroupForType(type: string): Exclude<RackGroup, "all"> {
  const normalized = type.normalize("NFKC").trim().toLowerCase();
  return Object.hasOwn(TYPE_GROUPS, normalized)
    ? TYPE_GROUPS[normalized]
    : "other";
}

/** Three's color parser cannot resolve the CSS variable used by the normal UI fallback. */
export function rackItemColor(item: Item): string {
  const candidates = [
    item.primary_color,
    item.tags?.primary_color,
    ...(item.colors ?? []),
    ...(item.tags?.colors ?? []),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const swatch = colorSwatch(candidate);
    if (/^#[\da-f]{6}$/i.test(swatch)) return swatch;
  }
  return "#c1beb6";
}

function normalizeQuery(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replaceAll("ς", "σ");
}
function wears(item: Item): number {
  return Number.isFinite(item.wear_count) ? Math.max(0, item.wear_count) : 0;
}
function timestamp(item: Item): number {
  const value = Date.parse(item.created_at);
  return Number.isFinite(value) ? value : 0;
}

export function filterRackItems(
  items: Item[],
  filters: RackFilters,
  labelForItem: (item: Item) => string,
): Item[] {
  const query = normalizeQuery(filters.query);
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (item.status !== "ready" || item.is_archived) return false;
      if (
        filters.group !== "all" &&
        rackGroupForType(item.type) !== filters.group
      )
        return false;
      if (filters.favoritesOnly && !item.favorite) return false;
      if (filters.wash === "clean" && item.needs_wash) return false;
      if (filters.wash === "wash" && !item.needs_wash) return false;
      if (!query) return true;
      const keywords = [
        labelForItem(item),
        item.name,
        item.brand,
        item.type,
        item.subtype,
        item.primary_color,
        item.tags?.primary_color,
        item.tags?.material,
        ...(item.tags?.style ?? []),
        ...(item.colors ?? []),
        ...(item.tags?.colors ?? []),
      ];
      return normalizeQuery(keywords.filter(Boolean).join(" ")).includes(query);
    })
    .sort((left, right) => {
      const compared =
        filters.sort === "leastWorn"
          ? wears(left.item) - wears(right.item)
          : filters.sort === "color"
            ? rackItemColor(left.item).localeCompare(rackItemColor(right.item))
            : timestamp(right.item) - timestamp(left.item);
      return compared || left.index - right.index;
    })
    .map(({ item }) => item);
}

/** A contiguous window limits the renderer's geometry while keeping the active item visible. */
export function rackWindow(
  items: Item[],
  selectedId: string | null,
  limit = 7,
): Item[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const size = Math.floor(limit);
  const selected = selectedId
    ? items.findIndex((item) => item.id === selectedId)
    : -1;
  const start = Math.max(
    0,
    Math.min(Math.max(0, selected) - Math.floor(size / 2), items.length - size),
  );
  return items.slice(start, start + size);
}
