export const MAX_RACK_DRAFT_ITEMS = 6;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only identifiers survive normalization; photos and item metadata belong to the API. */
export function normalizeRackDraftIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const unique = new Set<string>();
  for (const value of input) {
    if (typeof value !== "string") continue;
    const id = value.trim().toLowerCase();
    if (!UUID.test(id)) continue;
    unique.add(id);
    if (unique.size === MAX_RACK_DRAFT_ITEMS) break;
  }
  return Array.from(unique);
}

export function parseRackDraft(raw: string | null): {
  ids: string[];
  valid: boolean;
} {
  if (raw === null) return { ids: [], valid: true };
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("ids" in value) ||
      !Array.isArray(value.ids)
    ) {
      return { ids: [], valid: false };
    }
    return { ids: normalizeRackDraftIds(value.ids), valid: true };
  } catch {
    return { ids: [], valid: false };
  }
}
