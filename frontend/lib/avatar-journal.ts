import {
  normalizeAvatarConfig,
  isValidAvatarDate,
  type AvatarConfig,
} from "./avatar-studio";
import { parseFittingSeed } from "./fitting-seed";

export type AvatarSavedLook = {
  id: string;
  name: string;
  date: string;
  config: AvatarConfig;
  itemIds: string[];
  favorite: boolean;
  dressMode: boolean;
  showOuterwear: boolean;
  createdAt: string;
  thumbnail?: string;
};
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const AVATAR_JOURNAL_LIMIT = 24;
export const AVATAR_THUMBNAIL_MAX_LENGTH = 24_000;
/** Only local raster thumbnails are accepted; external URLs and SVG never enter the journal. */
export function normalizeAvatarThumbnail(input: unknown): string | undefined {
  return typeof input === "string" &&
    input.length <= AVATAR_THUMBNAIL_MAX_LENGTH &&
    /^data:image\/webp;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)$/.test(
      input,
    )
    ? input
    : undefined;
}
function sceneSignature(entry: AvatarSavedLook): string {
  return JSON.stringify({
    name: entry.name,
    date: entry.date,
    config: entry.config,
    itemIds: [...entry.itemIds].sort(),
    dressMode: entry.dressMode,
    showOuterwear: entry.showOuterwear,
  });
}
function normalizeLook(input: unknown): AvatarSavedLook | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (
    typeof value.id !== "string" ||
    !UUID.test(value.id) ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 80 ||
    typeof value.date !== "string" ||
    !isValidAvatarDate(value.date) ||
    !Array.isArray(value.itemIds) ||
    value.itemIds.length > 4 ||
    typeof value.favorite !== "boolean" ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt))
  )
    return null;
  if (!value.itemIds.every((id) => typeof id === "string" && UUID.test(id)))
    return null;
  const itemIds = parseFittingSeed(value.itemIds.join(","));
  if (itemIds.length !== value.itemIds.length) return null;
  const thumbnail = normalizeAvatarThumbnail(value.thumbnail);
  return {
    ...(thumbnail ? { thumbnail } : {}),
    id: value.id,
    name: value.name.trim(),
    date: value.date,
    config: normalizeAvatarConfig(value.config),
    itemIds,
    favorite: value.favorite,
    dressMode: value.dressMode === true,
    showOuterwear: value.showOuterwear === true,
    createdAt: new Date(value.createdAt).toISOString(),
  };
}
export function parseAvatarJournal(raw: string | null): {
  entries: AvatarSavedLook[];
  valid: boolean;
} {
  if (raw === null) return { entries: [], valid: true };
  if (raw.length > 750_000) return { entries: [], valid: false };
  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.entries) ||
      parsed.entries.length > AVATAR_JOURNAL_LIMIT
    )
      return { entries: [], valid: false };
    const unique = new Map<string, AvatarSavedLook>();
    let valid = true;
    for (const input of parsed.entries) {
      const look = normalizeLook(input);
      if (!look || unique.has(look.id)) {
        valid = false;
        continue;
      }
      unique.set(look.id, look);
    }
    return { entries: Array.from(unique.values()), valid };
  } catch {
    return { entries: [], valid: false };
  }
}
export function upsertAvatarLook(
  entries: AvatarSavedLook[],
  input: unknown,
): AvatarSavedLook[] {
  const look = normalizeLook(input);
  if (!look) throw new Error("Invalid avatar look");
  const key = sceneSignature(look);
  const existing =
    entries.find((entry) => entry.id === look.id) ??
    entries.find((entry) => sceneSignature(entry) === key);
  const saved = existing
    ? { ...look, id: existing.id, createdAt: existing.createdAt }
    : look;
  return [
    saved,
    ...entries.filter(
      (entry) => entry.id !== saved.id && sceneSignature(entry) !== key,
    ),
  ].slice(0, AVATAR_JOURNAL_LIMIT);
}

/** Attach only to a surviving, unchanged scene, including an exact scene deduplicated under another UUID. */
export function attachAvatarLookThumbnail(
  entries: AvatarSavedLook[],
  input: AvatarSavedLook,
  thumbnail: string,
): AvatarSavedLook[] | null {
  const look = normalizeLook(input);
  const safeThumbnail = normalizeAvatarThumbnail(thumbnail);
  if (!look || !safeThumbnail) return null;
  const signature = sceneSignature(look);
  const sameId = entries.find((entry) => entry.id === look.id);
  // A reused UUID must never receive a capture of its previous scene.
  const existing =
    sameId ?? entries.find((entry) => sceneSignature(entry) === signature);
  if (!existing || sceneSignature(existing) !== signature) return null;
  return entries.map((entry) =>
    entry.id === existing.id ? { ...entry, thumbnail: safeThumbnail } : entry,
  );
}
