"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  api,
  getAccessToken,
  getActiveUserId,
  subscribeActiveSession,
} from "@/lib/api";
import { isInspirationItemEligible } from "@/lib/inspiration/matching";
import type { Item, ItemListResponse } from "@/lib/types";
import { queryKeys } from "@/lib/hooks/query-keys";

/** Separate from items.list: optimistic item updates expect a single page shape. */
export function useInspirationWardrobe() {
  const owner = useSyncExternalStore(
    subscribeActiveSession,
    getActiveUserId,
    () => null,
  );
  const query = useInfiniteQuery({
    queryKey: queryKeys.inspirationWardrobe(owner),
    enabled: !!owner && !!getAccessToken(),
    initialPageParam: 1,
    retry: false,
    // Item mutations invalidate items.all, which intentionally has a different
    // cache shape. Revalidate this independent inventory whenever it is revisited.
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
          throw new Error("Inspiration session changed");
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
            needs_wash: "false",
            sort_by: "wear_count",
            sort_order: "asc",
          },
          signal: controller.signal,
        });
        assertSession();
        return {
          ...page,
          items: page.items.filter(
            (item) => item.user_id === owner && isInspirationItemEligible(item),
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
    for (const page of query.data?.pages ?? [])
      for (const item of page.items) unique.set(item.id, item);
    return Array.from(unique.values());
  }, [query.data]);
  const {
    isFetching,
    hasNextPage,
    fetchNextPage,
    refetch: refetchQuery,
  } = query;
  const loadMore = useCallback(async () => {
    if (owner !== getActiveUserId() || !owner || isFetching || !hasNextPage)
      return;
    await fetchNextPage({ cancelRefetch: false });
  }, [owner, isFetching, hasNextPage, fetchNextPage]);
  const refetch = useCallback(async () => {
    if (owner !== getActiveUserId() || !owner) return;
    await refetchQuery();
  }, [owner, refetchQuery]);
  return {
    items,
    total: query.data?.pages[0]?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch,
    hasMore: !!query.hasNextPage,
    loadMore,
    isFetchingMore: query.isFetchingNextPage,
  };
}
