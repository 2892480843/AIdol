'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from 'next-auth';
import { useSession } from 'next-auth/react';
import { api, NetworkError } from '@/lib/api';
import { queryKeys } from '@/lib/hooks/query-keys';
import { applySessionToken } from '@/lib/hooks/use-session-token';
import { invalidateOutfitCaches } from '@/lib/hooks/cache-invalidation';
import type { Outfit } from '@/lib/types';
import { isTaskActive, type RecommendationRequest, type RecommendationTask, type RecommendationTaskList } from './types';

interface Owner {
  ownerId: string;
  session: Session;
}
interface Submission extends Owner {
  request: RecommendationRequest;
  idempotencyKey: string;
}
interface TaskAction extends Owner {
  taskId: string;
  action: 'retry' | 'cancel';
}

export function useRecommendationTaskList(pollInterval = 1500) {
  const { data: session, status } = useSession();
  const ownerId = status === 'authenticated' ? session?.user.id ?? null : null;
  const tasksQuery = useQuery({
    queryKey: queryKeys.recommendationTasks.list(ownerId ?? ''),
    queryFn: ({ signal }) => {
      applySessionToken(session);
      return api.get<RecommendationTaskList>('/tasks', { params: { kind: 'recommendation', limit: '20' }, signal });
    },
    enabled: !!ownerId,
    staleTime: 0,
    refetchInterval: (query) => query.state.data?.tasks.some(isTaskActive) ? pollInterval : false,
    meta: { toastsOwnErrors: true },
  });
  return { ownerId, session, tasksQuery, tasks: ownerId ? tasksQuery.data?.tasks ?? [] : [] };
}

export function useRecommendationTasks({ pollInterval = 1500 }: { pollInterval?: number } = {}) {
  const { ownerId, session, tasksQuery, tasks } = useRecommendationTaskList(pollInterval);
  const currentOwner = useRef(ownerId);
  currentOwner.current = ownerId;
  const queryClient = useQueryClient();
  useEffect(() => {
    currentOwner.current = ownerId;
    return () => { currentOwner.current = null; };
  }, [ownerId]);
  const [selection, setSelection] = useState<{ ownerId: string; taskId: string | null } | null>(null);

  function authorize(owner: Owner) {
    if (owner.ownerId !== currentOwner.current) throw new Error('Session changed');
    applySessionToken(owner.session);
  }

  // A reload resumes observing server work. Only an explicit event ever submits model work.
  const activeTaskId = selection?.ownerId === ownerId
    ? selection.taskId
    : tasks.find(isTaskActive)?.id ?? null;
  const restorableTaskId = tasks.find(isTaskActive)?.id;
  useEffect(() => {
    if (ownerId && restorableTaskId) {
      setSelection((current) => current?.ownerId === ownerId ? current : { ownerId, taskId: restorableTaskId });
    }
  }, [ownerId, restorableTaskId]);
  const taskQuery = useQuery({
    queryKey: queryKeys.recommendationTasks.detail(ownerId ?? '', activeTaskId ?? ''),
    queryFn: ({ signal }) => {
      authorize({ ownerId: ownerId!, session: session! });
      return api.get<RecommendationTask>(`/tasks/${activeTaskId}`, { signal });
    },
    placeholderData: tasks.find((task) => task.id === activeTaskId),
    enabled: !!ownerId && !!activeTaskId,
    refetchInterval: (query) => query.state.data && isTaskActive(query.state.data) ? pollInterval : false,
    meta: { toastsOwnErrors: true },
  });
  const activeTask = ownerId && activeTaskId ? taskQuery.data ?? null : null;
  const outfitIds = activeTask?.result?.outfit_ids;
  const resultsQuery = useQuery({
    queryKey: queryKeys.recommendationTasks.results(ownerId ?? '', activeTaskId ?? ''),
    queryFn: ({ signal }) => {
      authorize({ ownerId: ownerId!, session: session! });
      return Promise.all((outfitIds ?? []).map((id) => api.get<Outfit>(`/outfits/${id}`, { signal })));
    },
    enabled: !!ownerId && activeTask?.status === 'succeeded' && !!outfitIds?.length,
    meta: { toastsOwnErrors: true },
  });

  function cacheTask(task: RecommendationTask, taskOwner: string) {
    if (currentOwner.current !== taskOwner) return;
    queryClient.setQueryData(queryKeys.recommendationTasks.detail(taskOwner, task.id), task);
    queryClient.setQueryData<RecommendationTaskList>(queryKeys.recommendationTasks.list(taskOwner), (previous) => ({
      tasks: [task, ...(previous?.tasks ?? []).filter((existing) => existing.id !== task.id)].slice(0, 20),
    }));
    setSelection({ ownerId: taskOwner, taskId: task.id });
  }

  const submission = useMutation({
    mutationFn: (input: Submission) => {
      authorize(input);
      return api.post<RecommendationTask>('/tasks/recommendations', input.request, {
        headers: { 'Idempotency-Key': input.idempotencyKey },
      });
    },
    // The key belongs to this user action and survives transport retries; remounts never replay it.
    retry: (failureCount, error) => error instanceof NetworkError && failureCount < 1,
    retryDelay: 500,
    onSuccess: (task, input) => cacheTask(task, input.ownerId),
    meta: { toastsOwnErrors: true },
  });
  const action = useMutation({
    onMutate: async (input: TaskAction) => {
      // A status read started before cancel/retry must not replace the newer action response.
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.recommendationTasks.detail(input.ownerId, input.taskId) }),
        queryClient.cancelQueries({ queryKey: queryKeys.recommendationTasks.list(input.ownerId) }),
      ]);
    },
    mutationFn: (input: TaskAction) => {
      authorize(input);
      return api.post<RecommendationTask>(`/tasks/${input.taskId}/${input.action}`);
    },
    onSuccess: async (task, input) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.recommendationTasks.detail(input.ownerId, input.taskId) }),
        queryClient.cancelQueries({ queryKey: queryKeys.recommendationTasks.list(input.ownerId) }),
      ]);
      cacheTask(task, input.ownerId);
    },
    meta: { toastsOwnErrors: true },
  });

  useEffect(() => {
    if (activeTask?.status === 'succeeded') invalidateOutfitCaches(queryClient);
  }, [activeTask?.id, activeTask?.status, queryClient]);

  function owner(): Owner {
    if (!ownerId || !session) throw new Error('Authentication required');
    return { ownerId, session };
  }

  return {
    ownerId,
    tasks,
    activeTask,
    outfits: ownerId && activeTask?.status === 'succeeded' ? resultsQuery.data : undefined,
    isLoading: !!ownerId && tasksQuery.isPending,
    isLoadingResults: activeTask?.status === 'succeeded' && resultsQuery.isFetching,
    isSubmitting: submission.isPending && submission.variables?.ownerId === ownerId,
    isActing: action.isPending && action.variables?.ownerId === ownerId,
    error: tasksQuery.error ?? taskQuery.error ?? resultsQuery.error
      ?? (submission.variables?.ownerId === ownerId ? submission.error : null)
      ?? (action.variables?.ownerId === ownerId ? action.error : null),
    submit: (request: RecommendationRequest) => submission.mutateAsync({ ...owner(), request, idempotencyKey: crypto.randomUUID() }),
    retry: (taskId: string) => action.mutateAsync({ ...owner(), taskId, action: 'retry' }),
    cancel: (taskId: string) => action.mutateAsync({ ...owner(), taskId, action: 'cancel' }),
    openTask: (taskId: string) => {
      if (ownerId) setSelection({ ownerId, taskId });
    },
    clearSelection: () => {
      if (ownerId) setSelection({ ownerId, taskId: null });
      submission.reset();
      action.reset();
    },
    refresh: async () => {
      await tasksQuery.refetch();
      if (activeTaskId) await taskQuery.refetch();
      if (activeTask?.status === 'succeeded') await resultsQuery.refetch();
    },
  };
}
