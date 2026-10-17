import { getActiveUserId } from '@/lib/api';

function currentDraftKey(): string | null {
  const ownerId = getActiveUserId();
  return ownerId ? `studio_draft_v2:${encodeURIComponent(ownerId)}` : null;
}
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export interface StudioDraft {
  items: string[];
  name: string;
  occasion: string | null;
  timestamp: number;
}

export function saveDraft(
  draft: Omit<StudioDraft, 'timestamp'>
): void {
  const key = currentDraftKey();
  if (typeof window === 'undefined' || !key) return;
  try {
    const payload: StudioDraft = { ...draft, timestamp: Date.now() };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // localStorage full or disabled
  }
}

export function loadDraft(): StudioDraft | null {
  const key = currentDraftKey();
  if (typeof window === 'undefined' || !key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as StudioDraft;
    if (!draft || typeof draft.timestamp !== 'number') return null;
    if (Date.now() - draft.timestamp > DRAFT_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  const key = currentDraftKey();
  if (typeof window === 'undefined' || !key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // noop
  }
}
