"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLooksOwnerScope } from "@/lib/looks/use-owner-scope";
import { captureLookSession } from "@/lib/looks/session";
import { validateLookPhoto } from "@/lib/looks/photo";
import { tryOnRequest } from "@/lib/looks/tryon-api";
import {
  TryOnError,
  type TryOnCapabilities,
  type TryOnInput,
  type TryOnTask,
  type TryOnTaskPreview,
} from "@/lib/looks/tryon-types";
import { LookStorageError } from "@/lib/looks/types";
import { queryKeys } from "./query-keys";
import { cacheResultImage, readResultImage } from "@/lib/looks/result-image-cache";
import { createImageLoadQueue } from "@/lib/looks/image-load-queue";
import { FITTING_GROUPS } from "@/lib/fitting-room";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const active = (task: TryOnTask) =>
  ["submitting", "queued", "processing"].includes(task.status);
function taskWithItems(value: TryOnTask): TryOnTask | null {
  if (
    !value ||
    typeof value.id !== "string" ||
    !uuid.test(value.id) ||
    typeof value.item_id !== "string" ||
    !uuid.test(value.item_id) ||
    !["submitting", "queued", "processing", "succeeded", "failed"].includes(
      value.status,
    ) ||
    (value.result_url !== null && typeof value.result_url !== "string")
  )
    return null;
  const ids = value.item_ids === undefined ? [value.item_id] : value.item_ids;
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.some((id) => typeof id !== "string" || !uuid.test(id))
  )
    return null;
  const normalized = ids.map((id) => id.toLowerCase());
  if (
    new Set(normalized).size !== normalized.length ||
    normalized[0] !== value.item_id.toLowerCase()
  )
    return null;
  return { ...value, item_ids: normalized };
}
type ImageEntry = {
  source: string;
  controller: AbortController;
  url?: string;
  error?: boolean;
};
type SubmissionState = {
  owner: string | null;
  epoch: number;
  isCreating: boolean;
  error: Error | null;
};

export function useTryOn(preferredTaskId: string | null = null) {
  const { ownerId, epoch, capture } = useLooksOwnerScope();
  const client = useQueryClient();
  const [submission, setSubmission] = useState<SubmissionState>({
    owner: ownerId,
    epoch,
    isCreating: false,
    error: null,
  });
  const running = useRef(false);
  const submissions = useRef(new Set<() => void>());
  const mounted = useRef(true);
  const pendingIntent = useRef<{
    owner: string;
    epoch: number;
    file: File;
    itemIds: string[];
    key: string;
  } | null>(null);
  const imageQueue = useRef<ReturnType<typeof createImageLoadQueue> | null>(null);
  if (!imageQueue.current) imageQueue.current = createImageLoadQueue();
  const images = useRef(new Map<string, ImageEntry>());
  const [imageState, setImageState] = useState<{
    owner: string | null;
    epoch: number;
    values: Record<string, { url?: string; error?: boolean }>;
  }>({ owner: ownerId, epoch, values: {} });
  const [imageRefresh, setImageRefresh] = useState(0);
  const capabilitiesQuery = useQuery({
    queryKey: queryKeys.tryOn.capabilities(ownerId, epoch),
    enabled: !!ownerId,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    meta: { toastsOwnErrors: true },
    queryFn: async ({ signal }) => {
      const scope = capture();
      const value = await tryOnRequest<TryOnCapabilities>(
        scope.ownerId,
        "/tryon/capabilities",
        {},
        signal,
      );
      scope.assert();
      if (
        typeof value.available !== "boolean" ||
        typeof value.configured !== "boolean" ||
        typeof value.enabled !== "boolean" ||
        !Array.isArray(value.supported_categories) ||
        value.supported_categories.some(
          (category) => !FITTING_GROUPS.includes(category),
        ) ||
        !Array.isArray(value.supported_item_types) ||
        value.supported_item_types.some(
          (type) => typeof type !== "string" || !type,
        ) ||
        !Number.isSafeInteger(value.max_items) ||
        value.max_items < 1
      )
        throw new TryOnError("request-failed");
      return value;
    },
  });
  const isCreating =
    submission.owner === ownerId &&
    submission.epoch === epoch &&
    submission.isCreating;
  const tasksQuery = useQuery({
    queryKey: queryKeys.tryOn.list(ownerId, epoch),
    enabled: !!ownerId,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    meta: { toastsOwnErrors: true },
    queryFn: async ({ signal }) => {
      const scope = capture();
      const value = await tryOnRequest<{ items: TryOnTask[] }>(
        scope.ownerId,
        "/tryon/tasks?limit=20",
        {},
        signal,
      );
      scope.assert();
      if (!Array.isArray(value.items)) throw new TryOnError("request-failed");
      const items = value.items.map(taskWithItems);
      if (items.some((task) => task === null))
        throw new TryOnError("request-failed");
      return { ...value, items: items as TryOnTask[] };
    },
    refetchInterval: (query) =>
      isCreating || query.state.data?.items.some(active) ? 3000 : false,
  });
  const { refetch: refetchList } = tasksQuery;
  const { refetch: refetchCapability } = capabilitiesQuery;
  useEffect(() => {
    const activeSubmissions = submissions.current;
    const activeImages = images.current;
    mounted.current = true;
    running.current = false;
    pendingIntent.current = null;
    setSubmission({ owner: ownerId, epoch, isCreating: false, error: null });
    setImageState({ owner: ownerId, epoch, values: {} });
    return () => {
      mounted.current = false;
      pendingIntent.current = null;
      activeSubmissions.forEach((abort) => abort());
      activeSubmissions.clear();
      activeImages.forEach((entry) => {
        entry.controller.abort();
        if (entry.url) URL.revokeObjectURL(entry.url);
      });
      activeImages.clear();
    };
  }, [ownerId, epoch]);
  useEffect(() => {
    if (!ownerId) return;
    const scope = capture();
    const tasks = tasksQuery.data?.items ?? [];
    const validIds = new Set(tasks.map((task) => task.id));
    images.current.forEach((entry, id) => {
      if (!validIds.has(id)) {
        entry.controller.abort();
        if (entry.url) URL.revokeObjectURL(entry.url);
        images.current.delete(id);
      }
    });
    const publish = () => {
      if (!mounted.current || !scope.isCurrent()) return;
      const values: Record<string, { url?: string; error?: boolean }> = {};
      images.current.forEach((entry, id) => {
        values[id] = { url: entry.url, error: entry.error };
      });
      setImageState({ owner: scope.ownerId, epoch: scope.epoch, values });
    };
    imageQueue.current!.prioritize(preferredTaskId);
    const ordered = [...tasks].sort((a, b) => Number(b.id === preferredTaskId) - Number(a.id === preferredTaskId));
    for (const task of ordered) {
      if (task.status !== "succeeded" || !task.result_url) continue;
      const old = images.current.get(task.id);
      if (old?.source === `${task.result_url}:${task.updated_at}`) continue;
      if (old?.url) URL.revokeObjectURL(old.url);
      old?.controller.abort();
      const entry: ImageEntry = {
        source: `${task.result_url}:${task.updated_at}`,
        controller: new AbortController(),
      };
      images.current.set(task.id, entry);
      if (task.result_url !== `/api/v1/tryon/tasks/${task.id}/image`) {
        entry.error = true;
        continue;
      }
      const source = `${task.result_url}:${task.updated_at}`;
      void imageQueue.current!.add(task.id, entry.controller.signal, async () => {
        scope.assert();
        const cached = readResultImage(client, scope.ownerId, source);
        if (cached) return cached;
        const blob = await tryOnRequest<Blob>(
          scope.ownerId,
          `/tryon/tasks/${task.id}/image`,
          {},
          entry.controller.signal,
          true,
        );
        scope.assert();
        if (entry.controller.signal.aborted) throw new TryOnError("request-failed");
        if (!blob.size || !["image/jpeg", "image/png", "image/webp"].includes(blob.type))
          throw new TryOnError("request-failed");
        cacheResultImage(client, scope.ownerId, source, blob);
        return blob;
      })
        .then((blob) => {
          scope.assert();
          if (
            !mounted.current ||
            entry.controller.signal.aborted ||
            images.current.get(task.id) !== entry
          )
            return;
          if (
            !blob.size ||
            !["image/jpeg", "image/png", "image/webp"].includes(blob.type)
          )
            throw new TryOnError("request-failed");
          entry.url = URL.createObjectURL(blob);
          publish();
        })
        .catch(() => {
          if (
            mounted.current &&
            scope.isCurrent() &&
            !entry.controller.signal.aborted
          ) {
            entry.error = true;
            publish();
          }
        });
    }
    publish();
  }, [ownerId, epoch, capture, tasksQuery.data, imageRefresh, client, preferredTaskId]);
  const refetchTasks = useCallback(async () => {
    const scope = capture();
    images.current.forEach((entry, id) => {
      if (entry.error) {
        entry.controller.abort();
        if (entry.url) URL.revokeObjectURL(entry.url);
        images.current.delete(id);
      }
    });
    const result = await refetchList();
    scope.assert();
    setImageRefresh((value) => value + 1);
    return result;
  }, [capture, refetchList]);
  const refetchCapabilities = useCallback(async () => {
    const scope = capture();
    const result = await refetchCapability();
    scope.assert();
    return result;
  }, [capture, refetchCapability]);
  const create = useCallback(
    async (input: TryOnInput): Promise<TryOnTask> => {
      const scope = capture();
      const cap = capabilitiesQuery.data;
      if (
        !cap?.available ||
        !cap.configured ||
        !cap.enabled ||
        !Number.isSafeInteger(cap.max_items) ||
        cap.max_items < 1 ||
        !cap.supported_categories.length ||
        !cap.supported_item_types.length
      )
        throw new TryOnError("unavailable");
      if (input.consent !== true) throw new TryOnError("consent-required");
      const multiple = Object.hasOwn(input, "itemIds");
      if (multiple && Object.hasOwn(input, "itemId"))
        throw new TryOnError("invalid-item");
      const supplied = multiple ? input.itemIds : [input.itemId];
      if (
        !Array.isArray(supplied) ||
        !supplied.length ||
        supplied.length > cap.max_items ||
        supplied.some((id) => typeof id !== "string" || !uuid.test(id))
      )
        throw new TryOnError("invalid-item");
      const itemIds = supplied.map((id) => id!.toLowerCase());
      if (new Set(itemIds).size !== itemIds.length)
        throw new TryOnError("invalid-item");
      if (running.current) throw new TryOnError("request-failed");
      running.current = true;
      setSubmission({
        owner: scope.ownerId,
        epoch: scope.epoch,
        isCreating: true,
        error: null,
      });
      const session = captureLookSession(scope.ownerId, true);
      submissions.current.add(session.abort);
      try {
        await validateLookPhoto(input.personPhoto, session.signal);
        scope.assert();
        session.assert();
        if (
          !cap.accepted_mime_types.includes(input.personPhoto.type) ||
          input.personPhoto.size > cap.max_person_image_bytes
        )
          throw new LookStorageError("invalid-photo");
        const old = pendingIntent.current;
        const key =
          old?.owner === scope.ownerId &&
          old.epoch === scope.epoch &&
          old.file === input.personPhoto &&
          old.itemIds.length === itemIds.length &&
          old.itemIds.every((id, index) => id === itemIds[index])
            ? old.key
            : crypto.randomUUID();
        pendingIntent.current = {
          owner: scope.ownerId,
          epoch: scope.epoch,
          file: input.personPhoto,
          itemIds,
          key,
        };
        const form = new FormData();
        if (multiple) form.append("item_ids", JSON.stringify(itemIds));
        else form.append("item_id", itemIds[0]);
        form.append("person_image", input.personPhoto, input.personPhoto.name);
        form.append("consent", "true");
        const value = await tryOnRequest<TryOnTask>(
          scope.ownerId,
          "/tryon/tasks",
          { method: "POST", body: form, headers: { "Idempotency-Key": key } },
          session.signal,
        );
        scope.assert();
        if (!mounted.current) throw new LookStorageError("session-changed");
        const task = taskWithItems(value);
        if (
          !task ||
          task.item_ids!.length !== itemIds.length ||
          task.item_ids!.some((id, index) => id !== itemIds[index])
        )
          throw new TryOnError("request-failed");
        pendingIntent.current = null;
        client.setQueryData<{ items: TryOnTask[] }>(
          queryKeys.tryOn.list(scope.ownerId, scope.epoch),
          (previous) => ({
            items: [
              task,
              ...(previous?.items ?? []).filter(
                (entry) => entry.id !== task.id,
              ),
            ].slice(0, 20),
          }),
        );
        return task;
      } catch (error) {
        if (mounted.current && scope.isCurrent()) {
          setSubmission({
            owner: scope.ownerId,
            epoch: scope.epoch,
            isCreating: true,
            error:
              error instanceof Error ? error : new TryOnError("request-failed"),
          });
          // Submission may already have been persisted. Read history to recover it;
          // only a later explicit user action can send another generation POST.
          if (pendingIntent.current) void refetchList();
        }
        throw error;
      } finally {
        session.dispose();
        submissions.current.delete(session.abort);
        if (mounted.current && scope.isCurrent()) {
          running.current = false;
          setSubmission((old) => ({ ...old, isCreating: false }));
        }
      }
    },
    [capture, capabilitiesQuery.data, client, refetchList],
  );
  const tasks: TryOnTaskPreview[] = (tasksQuery.data?.items ?? []).map(
    (task) => {
      const preview =
        imageState.owner === ownerId && imageState.epoch === epoch
          ? imageState.values[task.id]
          : undefined;
      return {
        ...task,
        resultImageUrl: preview?.url,
        resultImageError: preview?.error,
      };
    },
  );
  return {
    capabilities: capabilitiesQuery.data,
    isLoadingCapabilities: capabilitiesQuery.isLoading,
    capabilityError: capabilitiesQuery.error,
    refetchCapabilities,
    tasks,
    isLoadingTasks: tasksQuery.isLoading,
    error:
      submission.owner === ownerId && submission.epoch === epoch
        ? (submission.error ?? tasksQuery.error)
        : null,
    isCreating,
    create,
    refetchTasks,
  };
}
