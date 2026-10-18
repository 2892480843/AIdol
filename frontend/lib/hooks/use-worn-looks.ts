"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLooksOwnerScope } from "@/lib/looks/use-owner-scope";
import {
  createWornLook,
  deleteWornLook,
  listWornLooks,
  normalizeLookStorageError,
  updateWornLook,
  WORN_LOOKS_CHANGED,
} from "@/lib/looks/storage";
import {
  type LookStorageError,
  type WornLookInput,
  type WornLookPatch,
  type WornLookPreview,
} from "@/lib/looks/types";

export function useWornLooks() {
  const { ownerId, epoch, capture } = useLooksOwnerScope();
  const [state, setState] = useState<{
    owner: string | null;
    epoch: number;
    looks: WornLookPreview[];
    error: LookStorageError | null;
    isLoading: boolean;
    isSaving: boolean;
  }>({
    owner: ownerId,
    epoch,
    looks: [],
    error: null,
    isLoading: !!ownerId,
    isSaving: false,
  });
  const urls = useRef<string[]>([]);
  const request = useRef(0);
  const pending = useRef(0);
  const mounted = useRef(true);
  const revoke = useCallback(() => {
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current = [];
  }, []);
  const refresh = useCallback(async () => {
    const scope = capture();
    const version = ++request.current;
    const rows = await listWornLooks(scope.ownerId);
    scope.assert();
    if (!mounted.current || version !== request.current) return;
    const nextUrls: string[] = [];
    try {
      const looks = rows.map(
        ({ photoBlob, ownerId: _owner, schemaVersion: _version, ...look }) => {
          const photoUrl = URL.createObjectURL(photoBlob);
          nextUrls.push(photoUrl);
          return { ...look, photoUrl };
        },
      );
      scope.assert();
      revoke();
      urls.current = nextUrls;
      setState((old) => ({
        ...old,
        owner: scope.ownerId,
        epoch: scope.epoch,
        looks,
        error: null,
        isLoading: false,
      }));
    } catch (error) {
      nextUrls.forEach((url) => URL.revokeObjectURL(url));
      throw error;
    }
  }, [capture, revoke]);
  const refetch = useCallback(async () => {
    let scope: ReturnType<typeof capture>;
    try {
      scope = capture();
    } catch {
      return;
    }
    try {
      await refresh();
    } catch (error) {
      if (mounted.current && scope.isCurrent())
        setState((old) => ({
          ...old,
          owner: scope.ownerId,
          epoch: scope.epoch,
          error: normalizeLookStorageError(error),
          isLoading: false,
        }));
    }
  }, [capture, refresh]);
  useEffect(() => {
    mounted.current = true;
    pending.current = 0;
    setState({
      owner: ownerId,
      epoch,
      looks: [],
      error: null,
      isLoading: !!ownerId,
      isSaving: false,
    });
    if (ownerId) void refetch();
    const changed = (event: Event) => {
      if ((event as CustomEvent).detail === ownerId) void refetch();
    };
    window.addEventListener(WORN_LOOKS_CHANGED, changed);
    return () => {
      mounted.current = false;
      request.current += 1;
      revoke();
      window.removeEventListener(WORN_LOOKS_CHANGED, changed);
    };
  }, [ownerId, epoch, refetch, revoke]);
  const mutate = useCallback(
    async <T>(operation: (owner: string) => Promise<T>) => {
      const scope = capture();
      pending.current += 1;
      setState((old) => ({ ...old, isSaving: true, error: null }));
      try {
        const value = await operation(scope.ownerId);
        scope.assert();
        await refresh();
        scope.assert();
        return value;
      } catch (error) {
        const normalized = normalizeLookStorageError(error);
        if (mounted.current && scope.isCurrent())
          setState((old) => ({ ...old, error: normalized }));
        throw normalized;
      } finally {
        if (mounted.current && scope.isCurrent()) {
          pending.current = Math.max(0, pending.current - 1);
          setState((old) => ({ ...old, isSaving: pending.current > 0 }));
        }
      }
    },
    [capture, refresh],
  );
  const create = useCallback(
    (input: WornLookInput) => mutate((owner) => createWornLook(input, owner)),
    [mutate],
  );
  const update = useCallback(
    (id: string, patch: WornLookPatch) =>
      mutate((owner) => updateWornLook(id, patch, owner)),
    [mutate],
  );
  const remove = useCallback(
    (id: string) => mutate((owner) => deleteWornLook(id, owner)),
    [mutate],
  );
  const visible = state.owner === ownerId && state.epoch === epoch;
  return {
    looks: visible ? state.looks : [],
    isLoading: visible ? state.isLoading : !!ownerId,
    isSaving: visible && state.isSaving,
    error: visible ? state.error : null,
    create,
    update,
    remove,
    refetch,
  };
}
