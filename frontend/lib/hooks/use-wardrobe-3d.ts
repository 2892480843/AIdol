"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  api,
  getAccessToken,
  getActiveUserId,
  subscribeActiveSession,
} from "@/lib/api";
import type { Item, ItemListResponse } from "@/lib/types";
import { queryKeys } from "@/lib/hooks/query-keys";

/** This inventory deliberately includes laundry and uses a separate cache shape from items.list. */
export function useWardrobe3D() {
  const owner = useSyncExternalStore(
    subscribeActiveSession,
    getActiveUserId,
    () => null,
  );
  const query = useInfiniteQuery({
    queryKey: queryKeys.wardrobe3D(owner),
    enabled: !!owner && !!getAccessToken(),
    initialPageParam: 1,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    meta: { toastsOwnErrors: true },
    queryFn: async ({ pageParam, signal }) => {
      const token = getAccessToken();
      const controller = new AbortController();
      const abort = () => controller.abort();
      const unsubscribe = subscribeActiveSession(abort);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      const assertSession = () => {
        if (
          !owner ||
          !token ||
          controller.signal.aborted ||
          getActiveUserId() !== owner ||
          getAccessToken() !== token
        ) {
          throw new Error("Wardrobe session changed");
        }
      };
      try {
        assertSession();
        const page = await api.get<ItemListResponse>("/items", {
          params: {
            page: String(pageParam),
            page_size: "100",
            status: "ready",
            is_archived: "false",
            sort_by: "created_at",
            sort_order: "desc",
          },
          signal: controller.signal,
        });
        assertSession();
        return {
          ...page,
          items: page.items.filter(
            (item) =>
              item.user_id === owner &&
              item.status === "ready" &&
              !item.is_archived,
          ),
        };
      } catch (error) {
        assertSession();
        throw error;
      } finally {
        unsubscribe();
        signal.removeEventListener("abort", abort);
      }
    },
    getNextPageParam: (page) => (page.has_more ? page.page + 1 : undefined),
  });
  const items = useMemo(() => {
    const unique = new Map<string, Item>();
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        if (item.user_id === owner) unique.set(item.id, item);
      }
    }
    return Array.from(unique.values());
  }, [owner, query.data]);
  const {
    isFetching,
    hasNextPage,
    fetchNextPage,
    refetch: refetchQuery,
  } = query;
  const loadMore = useCallback(async () => {
    if (
      !owner ||
      owner !== getActiveUserId() ||
      !getAccessToken() ||
      isFetching ||
      !hasNextPage
    )
      return;
    return fetchNextPage({ cancelRefetch: false });
  }, [owner, isFetching, hasNextPage, fetchNextPage]);
  const refetch = useCallback(async () => {
    if (!owner || owner !== getActiveUserId() || !getAccessToken()) return;
    return refetchQuery();
  }, [owner, refetchQuery]);
  return {
    owner,
    items,
    total: query.data?.pages[0]?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch,
    hasMore: !!query.hasNextPage,
    loadMore,
    isFetchingMore: query.isFetchingNextPage,
  };
}
