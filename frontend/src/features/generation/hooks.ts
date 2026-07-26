import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { HttpError } from "@/lib/api";
import {
  type CreateGenerationInput,
  type Generation,
  createGeneration,
  fetchGeneration,
} from "./api";

const POLL_INTERVAL_MS = 1000;
// v0.8 起上游 apimart 异步，后端轮询上限 600s + 网络/重试余量 → 前端给 600s
const POLL_MAX_MS = 600_000;

/**
 * Submits a generation job. Reference images are uploaded earlier (see
 * useReferenceUploads) so this request is just the JSON-ish form fields —
 * no per-byte progress is meaningful here.
 */
export const useCreateGeneration = () =>
  useMutation<
    { job_id: string; status: "pending" },
    HttpError,
    CreateGenerationInput
  >({
    mutationFn: createGeneration,
  });

/**
 * Polls /api/generations/{jobId} every 1s until status is terminal
 * or local elapsed > POLL_MAX_MS. Uses a client-side start timestamp
 * (taken when jobId first appears) instead of the server's created_at,
 * which avoids timezone/clock-skew surprises.
 */
export const useGenerationPoll = (jobId: string | null) => {
  const qc = useQueryClient();
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (jobId) {
      startedAtRef.current = Date.now();
    } else {
      startedAtRef.current = null;
    }
  }, [jobId]);

  return useQuery<Generation, HttpError>({
    queryKey: ["generation", jobId],
    queryFn: () => fetchGeneration(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === "completed" || data.status === "failed")) {
        return false;
      }
      const startedAt = startedAtRef.current;
      if (startedAt && Date.now() - startedAt > POLL_MAX_MS) {
        qc.setQueryData<Generation>(["generation", jobId], (prev) =>
          prev ? { ...prev, status: "failed", error_code: "timeout" } : prev,
        );
        return false;
      }
      return POLL_INTERVAL_MS;
    },
    staleTime: 0,
    gcTime: 60_000,
  });
};
