import type { Item } from "@/lib/types";
import {
  COLOR_ALIASES,
  CLOTHING_COLORS,
} from "@/lib/generated/garment-vocabulary";
import { normalizeColor } from "@/lib/colors";
import { rackGroupForType } from "@/lib/wardrobe-3d";
import { isInspirationItemEligible } from "@/lib/inspiration/matching";

export const FITTING_GROUPS = [
  "tops",
  "bottoms",
  "dresses",
  "outerwear",
  "shoes",
] as const;
export type FittingGroup = (typeof FITTING_GROUPS)[number];
export function fittingGroupForType(type: string): FittingGroup | null {
  // A suit contains several garments and is deliberately unsupported by the provider contract.
  if (type.normalize("NFKC").trim().toLowerCase() === "suit") return null;
  const group = rackGroupForType(type);
  return FITTING_GROUPS.includes(group as FittingGroup)
    ? (group as FittingGroup)
    : null;
}

function usable(item: Item): boolean {
  return (
    isInspirationItemEligible(item) && fittingGroupForType(item.type) !== null
  );
}

function addToSlots(
  ids: string[],
  next: Item,
  byId: ReadonlyMap<string, Item>,
): string[] {
  const group = fittingGroupForType(next.type);
  const retained = ids.filter((id) => {
    const old = byId.get(id);
    if (!old) return false;
    const slot = fittingGroupForType(old.type);
    return (
      slot !== group &&
      !(group === "dresses" && (slot === "tops" || slot === "bottoms")) &&
      !((group === "tops" || group === "bottoms") && slot === "dresses")
    );
  });
  return retained.length < 4 ? [...retained, next.id] : retained;
}

/** Selection uses current owned rows; stale IDs and duplicate slots never consume capacity. */
export function toggleFittingItem(
  ids: string[],
  item: Item,
  items: Item[],
): string[] {
  const byId = new Map(items.filter(usable).map((value) => [value.id, value]));
  let selected: string[] = [];
  for (const id of ids) {
    const value = byId.get(id);
    if (value) selected = addToSlots(selected, value, byId);
  }
  if (selected.includes(item.id))
    return selected.filter((id) => id !== item.id);
  const current = byId.get(item.id);
  if (!current || current.user_id !== item.user_id || !usable(item))
    return selected;
  return addToSlots(selected, current, byId);
}

/** Saved IDs stay explicit until the user removes them; selecting another item must not hide a missing garment. */
export function toggleFittingItemPreservingUnknown(
  ids: string[],
  item: Item,
  items: Item[],
): string[] {
  const known = new Set(items.filter(usable).map((value) => value.id));
  const unresolved = ids.filter((id) => !known.has(id));
  const selected = toggleFittingItem(
    ids.filter((id) => known.has(id)),
    item,
    items,
  );
  return selected.length + unresolved.length <= 4
    ? [...selected, ...unresolved]
    : ids;
}

type Alias<T extends string> = { phrase: string; values: T[] };
const groupAliases: Alias<FittingGroup>[] = [
  { phrase: "上衣", values: ["tops"] },
  { phrase: "tops", values: ["tops"] },
  { phrase: "top", values: ["tops"] },
  { phrase: "下装", values: ["bottoms"] },
  { phrase: "bottoms", values: ["bottoms"] },
  { phrase: "bottom", values: ["bottoms"] },
  { phrase: "外套", values: ["outerwear"] },
  { phrase: "outerwear", values: ["outerwear"] },
  { phrase: "鞋子", values: ["shoes"] },
  { phrase: "鞋", values: ["shoes"] },
  { phrase: "shoe", values: ["shoes"] },
];
const typeAliases: Alias<string>[] = [
  { phrase: "衬衫", values: ["shirt", "blouse"] },
  { phrase: "衬衣", values: ["shirt", "blouse"] },
  { phrase: "shirt", values: ["shirt", "blouse"] },
  { phrase: "shirts", values: ["shirt", "blouse"] },
  { phrase: "t恤", values: ["t-shirt"] },
  { phrase: "t 恤", values: ["t-shirt"] },
  { phrase: "t-shirt", values: ["t-shirt"] },
  { phrase: "t shirt", values: ["t-shirt"] },
  { phrase: "t shirts", values: ["t-shirt"] },
  { phrase: "t-shirts", values: ["t-shirt"] },
  { phrase: "tshirt", values: ["t-shirt"] },
  { phrase: "tee", values: ["t-shirt"] },
  { phrase: "卫衣", values: ["hoodie"] },
  { phrase: "hoodie", values: ["hoodie"] },
  { phrase: "毛衣", values: ["sweater"] },
  { phrase: "sweater", values: ["sweater"] },
  { phrase: "背心", values: ["tank-top", "vest"] },
  { phrase: "tank top", values: ["tank-top"] },
  { phrase: "vest", values: ["vest"] },
  { phrase: "polo", values: ["polo"] },
  { phrase: "blouse", values: ["blouse"] },
  { phrase: "裤子", values: ["pants", "jeans", "shorts"] },
  { phrase: "长裤", values: ["pants", "jeans"] },
  { phrase: "裤", values: ["pants", "jeans", "shorts"] },
  { phrase: "pants", values: ["pants", "jeans"] },
  { phrase: "trousers", values: ["pants", "jeans"] },
  { phrase: "牛仔裤", values: ["jeans"] },
  { phrase: "jeans", values: ["jeans"] },
  { phrase: "短裤", values: ["shorts"] },
  { phrase: "shorts", values: ["shorts"] },
  { phrase: "半身裙", values: ["skirt"] },
  { phrase: "裙子", values: ["skirt", "dress"] },
  { phrase: "裙", values: ["skirt", "dress"] },
  { phrase: "skirt", values: ["skirt"] },
  { phrase: "连衣裙", values: ["dress"] },
  { phrase: "dress", values: ["dress"] },
  { phrase: "dresses", values: ["dress"] },
  { phrase: "连体裤", values: ["jumpsuit"] },
  { phrase: "jumpsuit", values: ["jumpsuit"] },
  { phrase: "大衣", values: ["coat"] },
  { phrase: "风衣", values: ["coat"] },
  { phrase: "coat", values: ["coat"] },
  { phrase: "夹克", values: ["jacket"] },
  { phrase: "jacket", values: ["jacket"] },
  { phrase: "西装", values: ["blazer", "suit"] },
  { phrase: "blazer", values: ["blazer"] },
  { phrase: "suit", values: ["suit"] },
  { phrase: "开衫", values: ["cardigan"] },
  { phrase: "cardigan", values: ["cardigan"] },
  { phrase: "运动鞋", values: ["sneakers"] },
  { phrase: "球鞋", values: ["sneakers"] },
  { phrase: "sneakers", values: ["sneakers"] },
  { phrase: "靴子", values: ["boots"] },
  { phrase: "boots", values: ["boots"] },
  { phrase: "凉鞋", values: ["sandals"] },
  { phrase: "sandals", values: ["sandals"] },
  { phrase: "shoes", values: ["shoes", "sneakers", "boots", "sandals"] },
];
const colorAliases: Alias<string>[] = [
  ...CLOTHING_COLORS.map((value) => ({
    phrase: value.value,
    values: [value.value],
  })),
  ...Object.entries(COLOR_ALIASES).map(([phrase, value]) => ({
    phrase,
    values: [value],
  })),
  ...Object.entries({
    黑: "black",
    白: "white",
    灰: "gray",
    深蓝: "navy",
    藏蓝: "navy",
    浅蓝: "light-blue",
    蓝: "blue",
    酒红: "burgundy",
    红: "red",
    粉: "pink",
    军绿: "olive",
    橄榄绿: "olive",
    绿: "green",
    黄: "yellow",
    橙: "orange",
    紫: "purple",
    棕: "brown",
    咖啡: "brown",
    驼: "tan",
    卡其: "tan",
    米: "beige",
    奶油: "cream",
    奶白: "cream",
    金: "gold",
    银: "silver",
  }).map(([phrase, value]) => ({ phrase, values: [value] })),
];
const styleAliases: Alias<string>[] = [
  { phrase: "多巴胺", values: ["dopamine"] },
  { phrase: "dopamine", values: ["dopamine"] },
  { phrase: "极简", values: ["minimalist", "minimal", "clean"] },
  { phrase: "minimalist", values: ["minimalist", "minimal", "clean"] },
  { phrase: "运动", values: ["sporty", "sport", "athleisure"] },
  { phrase: "sporty", values: ["sporty", "sport", "athleisure"] },
  { phrase: "休闲", values: ["casual", "relaxed"] },
  { phrase: "casual", values: ["casual", "relaxed"] },
  { phrase: "正式", values: ["formal", "business"] },
  { phrase: "formal", values: ["formal", "business"] },
  { phrase: "复古", values: ["vintage", "retro"] },
  { phrase: "vintage", values: ["vintage", "retro"] },
  { phrase: "retro", values: ["vintage", "retro"] },
  { phrase: "街头", values: ["streetwear", "street"] },
  { phrase: "streetwear", values: ["streetwear", "street"] },
  { phrase: "机能", values: ["technical", "techwear"] },
  { phrase: "techwear", values: ["technical", "techwear"] },
  { phrase: "法式", values: ["french"] },
  { phrase: "french", values: ["french"] },
  { phrase: "日系", values: ["japanese", "cityboy"] },
  { phrase: "cityboy", values: ["japanese", "cityboy"] },
];

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}
function contains(text: string, phrase: string): boolean {
  if (!phrase) return false;
  if (/^[a-z0-9\s-]+$/.test(phrase)) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text);
  }
  return text.includes(phrase);
}

/** Longest aliases consume their text: 酒红 is one color, not both burgundy and red. */
function recognized<T extends string>(
  text: string,
  aliases: Alias<T>[],
): { values: Set<T>; remaining: string } {
  const values = new Set<T>();
  let rest = text;
  for (const { phrase, values: matches } of [...aliases].sort(
    (a, b) => b.phrase.length - a.phrase.length,
  )) {
    if (!contains(rest, phrase)) continue;
    matches.forEach((value) => values.add(value));
    rest = rest.replaceAll(phrase, " ");
  }
  return { values, remaining: rest };
}

/** Local intent matching only; callers confirm ties and separately authorize generation. */
export function selectFittingCommand(
  text: string,
  items: Item[],
  label: (item: Item) => string,
): { items: Item[]; ambiguous: boolean } {
  const query = normalized(text);
  if (!query) return { items: [], ambiguous: false };
  const candidates = Array.from(
    new Map(items.filter(usable).map((item) => [item.id, item])).values(),
  );
  const named = candidates
    .map((item) => ({ item, name: normalized(item.name || "") }))
    .filter(({ name }) => name && contains(query, name));
  if (named.length) {
    const bestLength = Math.max(...named.map((value) => value.name.length));
    const exact = named
      .filter((value) => value.name.length === bestLength)
      .map((value) => value.item);
    return { items: exact, ambiguous: exact.length > 1 };
  }
  const colors = recognized(query, colorAliases).values;
  const typeMatch = recognized(query, typeAliases);
  const types = typeMatch.values;
  const groups = recognized(typeMatch.remaining, groupAliases).values;
  // Category words such as 运动鞋 describe a shoe type, not a required sporty style tag.
  const styles = recognized(typeMatch.remaining, styleAliases).values;
  const hasCriteria = colors.size || types.size || groups.size || styles.size;
  const results = candidates.filter((item) => {
    if (types.size && !types.has(item.type)) return false;
    if (groups.size && !groups.has(fittingGroupForType(item.type)!))
      return false;
    if (colors.size) {
      const stored = [
        item.primary_color,
        item.tags?.primary_color,
        ...(item.colors ?? []),
        ...(item.tags?.colors ?? []),
      ]
        .filter((value): value is string => !!value)
        .map((value) => normalizeColor(value));
      if (!stored.some((color) => color && colors.has(color))) return false;
    }
    if (styles.size) {
      const stored = (item.tags?.style ?? []).flatMap((value) => [
        normalized(value),
        ...Array.from(recognized(normalized(value), styleAliases).values),
      ]);
      if (!stored.some((style) => styles.has(style))) return false;
    }
    if (hasCriteria) return true;
    const term = query
      .replace(
        /^(?:please\s+)?(?:select|show|wear|try|switch to|change to)\s+(?:a\s+|the\s+)?/,
        "",
      )
      .replace(/^(?:请|帮我|给我)?(?:换成|换上|选择|切换到|试试|穿上)/, "")
      .trim();
    return (
      term.length > 1 &&
      [label(item), item.name, item.brand, ...(item.tags?.style ?? [])].some(
        (value) => value && contains(normalized(value), term),
      )
    );
  });
  return { items: results, ambiguous: results.length > 1 };
}

/** Resolve incremental commands locally. No inference may submit a generation or clear unknown IDs. */
export function resolveFittingCommand(
  text: string,
  items: Item[],
  label: (item: Item) => string,
  selectedIds: string[],
  focus?: FittingGroup | null,
): {
  action: "wear" | "remove" | "clear" | "undo" | "none";
  items: Item[];
  ambiguous: boolean;
} {
  const query = normalized(text).replace(/[。.!?！？]+$/g, "");
  const empty = { items: [], ambiguous: false };
  if (/^(撤销|撤销上一步|撤銷|撤銷上一步|復原|復原上一步|上一步|undo|undo last change)$/.test(query))
    return { action: "undo", ...empty };
  if (/^(清空选择|清空所选|清空選擇|清空所選|clear selection|clear outfit)$/.test(query))
    return { action: "clear", ...empty };
  // Compound negative requests require an explicit choice rather than silently wearing the negated item.
  const removal =
    /^(?:(?:请|請|帮我|幫我|please)\s*)?(?:脱掉|脱下|脫掉|脫下|去掉|移除|不要穿|remove|take off)\s*(?:the\s+)?/;
  const removing = removal.test(query);
  if (
    /[，,;；]/.test(query) ||
    (!removing && /不要|不穿|别穿|不想|\b(?:not|don't|without)\b/.test(query))
  )
    return { action: "none", ...empty };
  const term = removing ? query.replace(removal, "") : query;
  let candidates = removing
    ? items.filter((item) => selectedIds.includes(item.id))
    : items;
  const typeMatch = recognized(term, typeAliases);
  const colorOnly =
    recognized(term, colorAliases).values.size > 0 &&
    !typeMatch.values.size &&
    !recognized(typeMatch.remaining, groupAliases).values.size &&
    !recognized(typeMatch.remaining, styleAliases).values.size;
  if (!removing && colorOnly && focus)
    candidates = candidates.filter(
      (item) => fittingGroupForType(item.type) === focus,
    );
  return {
    action: removing ? "remove" : "wear",
    ...selectFittingCommand(term, candidates, label),
  };
}
