import type { SuggestRequest } from '@/lib/types';

export type RecommendationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type RecommendationRequest = Omit<SuggestRequest, 'occasion' | 'weather_override'> & {
  occasion?: string | null;
  time_of_day?: string | null;
  weather_override?: (Omit<NonNullable<SuggestRequest['weather_override']>, 'feels_like'> & {
    feels_like?: number | null;
  }) | null;
  count?: 1 | 2 | 3;
};

export interface RecommendationTask {
  id: string;
  kind: 'recommendation';
  status: RecommendationStatus;
  stage: string;
  attempts: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
  request: RecommendationRequest;
  result: { outfit_ids: string[] } | null;
  error: string | null;
  error_code: string | null;
}

export interface RecommendationTaskList {
  tasks: RecommendationTask[];
}

export function isTaskActive(task: Pick<RecommendationTask, 'status'>): boolean {
  return task.status === 'queued' || task.status === 'running';
}
