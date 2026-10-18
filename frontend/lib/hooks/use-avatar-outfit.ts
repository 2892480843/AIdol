"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  api,
  getAccessToken,
  getActiveUserId,
  subscribeActiveSession,
} from "@/lib/api";
import {
  avatarFittingHref,
  isValidAvatarDate,
  normalizeAvatarTitle,
} from "@/lib/avatar-studio";
import { OCCASION_VALUES } from "@/lib/generated/garment-vocabulary";
import { queryKeys } from "@/lib/hooks/query-keys";
import { useLooksOwnerScope } from "@/lib/looks/use-owner-scope";
import type { Item, Outfit } from "@/lib/types";

export type AvatarOutfitErrorCode =
  | "invalid-items"
  | "invalid-name"
  | "invalid-date"
  | "invalid-occasion"
  | "session-changed"
  | "save-failed"
  | "busy";
export class AvatarOutfitError extends Error {
  constructor(public readonly code: AvatarOutfitErrorCode) {
    super(code);
    this.name = "AvatarOutfitError";
  }
}
export type SaveAvatarOutfitInput = {
  items: Item[];
  name: string;
  scheduledFor: string;
  occasion?: string;
};
type SaveOperation = { controller: AbortController; unsubscribe: () => void };

/** Only explicit actions write; polling, mounting and restoring local view settings never create an outfit. */
export function useSaveAvatarOutfit() {
  const { ownerId, epoch, capture } = useLooksOwnerScope();
  const queryClient = useQueryClient();
  const mounted = useRef(true);
  const operation = useRef<SaveOperation | null>(null);
  const [state, setState] = useState<{
    owner: string | null;
    epoch: number;
    isSaving: boolean;
    error: AvatarOutfitError | null;
  }>({ owner: ownerId, epoch, isSaving: false, error: null });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current?.controller.abort();
      operation.current?.unsubscribe();
      operation.current = null;
    };
  }, []);
  useEffect(() => {
    setState({ owner: ownerId, epoch, isSaving: false, error: null });
  }, [ownerId, epoch]);

  const save = useCallback(
    async (input: SaveAvatarOutfitInput): Promise<Outfit> => {
      let scope: ReturnType<typeof capture>;
      try {
        scope = capture();
      } catch {
        throw new AvatarOutfitError("session-changed");
      }
      const token = getAccessToken();
      if (!token || !mounted.current)
        throw new AvatarOutfitError("session-changed");
      if (operation.current) throw new AvatarOutfitError("busy");
      const controller = new AbortController();
      const active: SaveOperation = { controller, unsubscribe: () => {} };
      const current = () =>
        mounted.current &&
        scope.isCurrent() &&
        !controller.signal.aborted &&
        getActiveUserId() === scope.ownerId &&
        getAccessToken() === token;
      const assert = () => {
        if (!current()) throw new AvatarOutfitError("session-changed");
      };
      active.unsubscribe = subscribeActiveSession(() => {
        if (current()) return;
        controller.abort();
      });
      operation.current = active;
      let onAbort: (() => void) | undefined;
      try {
        assert();
        const name = normalizeAvatarTitle(input.name);
        if (!name) throw new AvatarOutfitError("invalid-name");
        if (!isValidAvatarDate(input.scheduledFor))
          throw new AvatarOutfitError("invalid-date");
        const occasion = input.occasion ?? "casual";
        if (!(OCCASION_VALUES as readonly string[]).includes(occasion))
          throw new AvatarOutfitError("invalid-occasion");
        if (
          !input.items.length ||
          input.items.some((item) => item.user_id !== scope.ownerId) ||
          !avatarFittingHref(input.items)
        )
          throw new AvatarOutfitError("invalid-items");
        setState({
          owner: scope.ownerId,
          epoch: scope.epoch,
          isSaving: true,
          error: null,
        });
        const aborted = new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(new AvatarOutfitError("session-changed"));
          controller.signal.addEventListener("abort", onAbort, { once: true });
        });
        assert();
        // api.post captures the Authorization header synchronously after this guard.
        const request = api.post<Outfit>(
          "/outfits/studio",
          {
            items: input.items.map((item) => item.id),
            name,
            occasion,
            scheduled_for: input.scheduledFor,
            mark_worn: false,
          },
          { signal: controller.signal },
        );
        const saved = await Promise.race([request, aborted]);
        assert();
        void queryClient.invalidateQueries({ queryKey: queryKeys.outfits.all });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.calendarOutfits.all,
        });
        return saved;
      } catch (error) {
        const normalized = !current()
          ? new AvatarOutfitError("session-changed")
          : error instanceof AvatarOutfitError
            ? error
            : new AvatarOutfitError("save-failed");
        if (current())
          setState({
            owner: scope.ownerId,
            epoch: scope.epoch,
            isSaving: false,
            error: normalized,
          });
        throw normalized;
      } finally {
        if (onAbort) controller.signal.removeEventListener("abort", onAbort);
        active.unsubscribe();
        if (operation.current === active) {
          operation.current = null;
          if (mounted.current)
            setState((previous) => ({ ...previous, isSaving: false }));
        }
      }
    },
    [capture, queryClient],
  );
  const clearError = useCallback(() => {
    if (mounted.current) setState((previous) => ({ ...previous, error: null }));
  }, []);
  const visible = state.owner === ownerId && state.epoch === epoch;
  return {
    ownerId,
    isSaving: visible && state.isSaving,
    error: visible ? state.error : null,
    save,
    clearError,
  };
}
