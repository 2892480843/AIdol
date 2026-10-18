"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getActiveUserId } from "@/lib/api";
import { useLooksOwnerScope } from "@/lib/looks/use-owner-scope";
import {
  attachAvatarLookThumbnail,
  parseAvatarJournal,
  upsertAvatarLook,
  type AvatarSavedLook,
} from "@/lib/avatar-journal";

const CHANGE = "dada:avatar-journal-changed";
const keyFor = (owner: string) =>
  `dada_avatar_journal_v1:${encodeURIComponent(owner)}`;
type Journal = {
  owner: string | null;
  epoch: number;
  entries: AvatarSavedLook[];
  hydrated: boolean;
  error: boolean;
};
function latestEntries(
  owner: string,
  fallback: AvatarSavedLook[],
  dirty: boolean,
) {
  if (!dirty) {
    try {
      const latest = parseAvatarJournal(localStorage.getItem(keyFor(owner)));
      if (latest.valid) return latest.entries;
    } catch {
      /* A failed write keeps the in-memory journal authoritative. */
    }
  }
  return fallback;
}
/** Local 3D scene settings, UUIDs and bounded render thumbnails. User photos and model binaries never enter this store. */
export function useAvatarJournal() {
  const { ownerId, epoch, capture } = useLooksOwnerScope();
  const [state, setState] = useState<Journal>({
    owner: null,
    epoch: -1,
    entries: [],
    hydrated: false,
    error: false,
  });
  const current = useRef(state);
  const dirty = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let alive = true;
    dirty.current = false;
    const read = () => {
      if (!alive || getActiveUserId() !== ownerId || dirty.current) return;
      let next: Journal = {
        owner: ownerId,
        epoch,
        entries: [],
        hydrated: true,
        error: false,
      };
      if (ownerId) {
        try {
          const stored = parseAvatarJournal(
            localStorage.getItem(keyFor(ownerId)),
          );
          next = { ...next, entries: stored.entries, error: !stored.valid };
        } catch {
          next.error = true;
        }
      }
      current.current = next;
      setState(next);
    };
    read();
    const changed = (event: Event) => {
      if (
        event instanceof StorageEvent &&
        event.key !== null &&
        event.key !== keyFor(ownerId || "")
      )
        return;
      if (
        event instanceof CustomEvent &&
        event.detail !== keyFor(ownerId || "")
      )
        return;
      read();
    };
    window.addEventListener("storage", changed);
    window.addEventListener(CHANGE, changed);
    return () => {
      alive = false;
      mounted.current = false;
      window.removeEventListener("storage", changed);
      window.removeEventListener(CHANGE, changed);
    };
  }, [ownerId, epoch]);
  const save = useCallback(
    (input: AvatarSavedLook) => {
      const fence = capture();
      const old = current.current;
      if (
        !mounted.current ||
        !old.hydrated ||
        old.owner !== fence.ownerId ||
        old.epoch !== fence.epoch
      )
        throw new Error("Avatar journal not ready");
      const previous = latestEntries(fence.ownerId, old.entries, dirty.current);
      const entries = upsertAvatarLook(previous, input);
      fence.assert();
      const next = { ...old, entries, error: false };
      try {
        localStorage.setItem(
          keyFor(fence.ownerId),
          JSON.stringify({ version: 1, entries }),
        );
        dirty.current = false;
      } catch {
        next.error = true;
        dirty.current = true;
      }
      fence.assert();
      current.current = next;
      setState(next);
      if (!next.error)
        window.dispatchEvent(
          new CustomEvent(CHANGE, { detail: keyFor(fence.ownerId) }),
        );
      return !next.error;
    },
    [capture],
  );
  const saveThumbnail = useCallback(
    (input: AvatarSavedLook, thumbnail: string) => {
      const fence = capture();
      const old = current.current;
      if (
        !mounted.current ||
        !old.hydrated ||
        old.owner !== fence.ownerId ||
        old.epoch !== fence.epoch
      )
        throw new Error("Avatar journal not ready");
      // An optional image must not overwrite pending saves or resurrect a scene deleted in another tab.
      if (dirty.current) return false;
      let entries: AvatarSavedLook[];
      try {
        const latest = parseAvatarJournal(
          localStorage.getItem(keyFor(fence.ownerId)),
        );
        if (!latest.valid) return false;
        const updated = attachAvatarLookThumbnail(
          latest.entries,
          input,
          thumbnail,
        );
        if (!updated) return false;
        entries = updated;
      } catch {
        return false;
      }
      fence.assert();
      try {
        localStorage.setItem(
          keyFor(fence.ownerId),
          JSON.stringify({ version: 1, entries }),
        );
      } catch {
        // Keep the durable scene and pending choices intact; optional thumbnails can be retried.
        fence.assert();
        const next = { ...old, error: true };
        current.current = next;
        setState(next);
        return false;
      }
      fence.assert();
      const next = { ...old, entries, error: false };
      current.current = next;
      setState(next);
      window.dispatchEvent(
        new CustomEvent(CHANGE, { detail: keyFor(fence.ownerId) }),
      );
      return true;
    },
    [capture],
  );
  const remove = useCallback(
    (id: string) => {
      const fence = capture();
      const old = current.current;
      if (
        !mounted.current ||
        !old.hydrated ||
        old.owner !== fence.ownerId ||
        old.epoch !== fence.epoch
      )
        throw new Error("Avatar journal not ready");
      const entries = latestEntries(
        fence.ownerId,
        old.entries,
        dirty.current,
      ).filter((entry) => entry.id !== id);
      fence.assert();
      try {
        localStorage.setItem(
          keyFor(fence.ownerId),
          JSON.stringify({ version: 1, entries }),
        );
      } catch {
        // A deletion is committed only when durable storage accepts it; keep the scene recoverable.
        const next = { ...old, error: true };
        fence.assert();
        current.current = next;
        setState(next);
        return false;
      }
      fence.assert();
      dirty.current = false;
      const next = { ...old, entries, error: false };
      current.current = next;
      setState(next);
      window.dispatchEvent(
        new CustomEvent(CHANGE, { detail: keyFor(fence.ownerId) }),
      );
      return true;
    },
    [capture],
  );
  const visible = state.owner === ownerId && state.epoch === epoch;
  return {
    entries: visible ? state.entries : [],
    hydrated: visible && state.hydrated,
    error: visible && state.error,
    save,
    saveThumbnail,
    remove,
  };
}
