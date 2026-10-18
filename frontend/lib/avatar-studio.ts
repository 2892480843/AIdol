import type { Item } from "@/lib/types";
import { fittingGroupForType } from "@/lib/fitting-room";
import { fittingRoomHref } from "@/lib/fitting-seed";
import { isInspirationItemEligible } from "@/lib/inspiration/matching";
import { rackItemColor } from "@/lib/wardrobe-3d";

export type AvatarModelId = "female" | "male";
export type AvatarPose = "relaxed" | "editorial";
export type AvatarLight = "daylight" | "warm" | "night";
export type AvatarPresetId =
  "sweet" | "minimal" | "street" | "relaxed" | "elegant" | "sport";
export type AvatarPalette = {
  tops: string;
  bottoms: string;
  dresses: string;
  outerwear: string;
  shoes: string;
};
export type AvatarGarments = Partial<Record<keyof AvatarPalette, string>>;
export type AvatarConfig = {
  renderMode?: "editorial";
  editorialLook?: "street" | "refined" | "dopamine";
  model: AvatarModelId;
  pose: AvatarPose;
  light: AvatarLight;
  preset: AvatarPresetId;
  rotation: number;
  zoom: number;
  palette: AvatarPalette;
  garments?: AvatarGarments;
};

export const AVATAR_PRESET_ORDER: readonly AvatarPresetId[] = [
  "sweet",
  "minimal",
  "street",
  "relaxed",
  "elegant",
  "sport",
];
export function stepAvatarPreset(
  current: AvatarPresetId,
  direction: -1 | 1,
): AvatarPresetId {
  const index = AVATAR_PRESET_ORDER.indexOf(current);
  return AVATAR_PRESET_ORDER[
    (index + direction + AVATAR_PRESET_ORDER.length) %
    AVATAR_PRESET_ORDER.length
  ];
}

export const AVATAR_PRESETS: Record<AvatarPresetId, AvatarPalette> = {
  sweet: {
    tops: "#f0c8d2",
    bottoms: "#ede1d3",
    dresses: "#d9a5b8",
    outerwear: "#e8cbbc",
    shoes: "#f5eee3",
  },
  minimal: {
    tops: "#eeeae0",
    bottoms: "#454b49",
    dresses: "#b8b0a1",
    outerwear: "#c8b99e",
    shoes: "#ece8e0",
  },
  street: {
    tops: "#4a4c56",
    bottoms: "#394254",
    dresses: "#363b43",
    outerwear: "#74734e",
    shoes: "#ede9df",
  },
  relaxed: {
    tops: "#d5d4c0",
    bottoms: "#b1b7aa",
    dresses: "#a3afa0",
    outerwear: "#d5c6af",
    shoes: "#eee7d9",
  },
  elegant: {
    tops: "#ebe1d3",
    bottoms: "#5a4c4a",
    dresses: "#7e4352",
    outerwear: "#a2836e",
    shoes: "#493d3b",
  },
  sport: {
    tops: "#a5c7b5",
    bottoms: "#313d46",
    dresses: "#647d83",
    outerwear: "#7a92a4",
    shoes: "#ecece7",
  },
};
for (const palette of Object.values(AVATAR_PRESETS)) Object.freeze(palette);
Object.freeze(AVATAR_PRESETS);

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = Object.freeze({
  model: "female",
  pose: "relaxed",
  light: "daylight",
  preset: "minimal",
  rotation: 0,
  zoom: 1,
  palette: Object.freeze({ ...AVATAR_PRESETS.minimal }),
});

export function clampAvatarRotation(value: number): number {
  return Number.isFinite(value) ? Math.max(-180, Math.min(180, value)) : 0;
}
export function clampAvatarZoom(value: number): number {
  return Number.isFinite(value) ? Math.max(0.75, Math.min(1.5, value)) : 1;
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function normalizeAvatarConfig(input: unknown): AvatarConfig {
  const value = record(input);
  const preset =
    typeof value.preset === "string" &&
      Object.hasOwn(AVATAR_PRESETS, value.preset)
      ? (value.preset as AvatarPresetId)
      : "minimal";
  const palette = { ...AVATAR_PRESETS[preset] };
  const colors = record(value.palette);
  for (const slot of Object.keys(palette) as (keyof AvatarPalette)[]) {
    const color = colors[slot];
    if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color))
      palette[slot] = color.toLowerCase();
  }
  const garments: AvatarGarments = {};
  const choices = record(value.garments);
  for (const slot of Object.keys(palette) as (keyof AvatarPalette)[]) {
    const choice = choices[slot];
    if (typeof choice === "string" && /^[a-z][a-z0-9-]{0,47}$/.test(choice))
      garments[slot] = choice;
  }
  return {
    ...(value.renderMode === "editorial" ? { renderMode: "editorial" as const } : {}),
    ...(value.editorialLook === "street" || value.editorialLook === "refined" ? { editorialLook: value.editorialLook } : value.editorialLook === "dopamine" ? { editorialLook: value.model === "male" ? "refined" as const : "dopamine" as const } : {}),
    model: value.model === "male" ? "male" : "female",
    pose: value.pose === "editorial" ? "editorial" : "relaxed",
    light:
      value.light === "warm" || value.light === "night"
        ? value.light
        : "daylight",
    preset,
    palette,
    ...(Object.keys(garments).length ? { garments } : {}),
    rotation:
      typeof value.rotation === "number"
        ? clampAvatarRotation(value.rotation)
        : 0,
    zoom: typeof value.zoom === "number" ? clampAvatarZoom(value.zoom) : 1,
  };
}

/** Date input values are calendar dates, never instants converted through UTC. */
export function isValidAvatarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
export function avatarLocalDate(date = new Date()): string {
  if (!Number.isFinite(date.getTime())) return "";
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function normalizeAvatarTitle(value: string): string {
  return Array.from(
    value
      .replace(/[\r\n\t]/g, " ")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .replace(/\s+/g, " "),
  )
    .slice(0, 100)
    .join("");
}

/** Color/type are preview adapters, not a claim that wardrobe photos became exact garment meshes. */
export function avatarPaletteForItems(
  items: Item[],
  base: AvatarPalette = AVATAR_PRESETS.minimal,
): AvatarPalette {
  const palette = normalizeAvatarConfig({ palette: base }).palette;
  for (const item of items) {
    if (!isInspirationItemEligible(item)) continue;
    const slot = fittingGroupForType(item.type);
    if (slot) palette[slot] = rackItemColor(item);
  }
  return palette;
}
export const avatarFittingHref = fittingRoomHref;
