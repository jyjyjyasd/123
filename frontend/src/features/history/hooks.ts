import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type { HttpError } from "@/lib/api";
import {
  type HistoryPage,
  deleteGeneration,
  fetchHistory,
} from "@/features/generation/api";

export const HISTORY_KEY = ["history"] as const;

export const useHistory = () =>
  useInfiniteQuery<HistoryPage, HttpError>({
    queryKey: HISTORY_KEY,
    queryFn: ({ pageParam }) => fetchHistory((pageParam as string | null) ?? null),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : undefined),
    staleTime: 5_000,
  });

export const useDeleteGeneration = () => {
  const qc = useQueryClient();
  return useMutation<null, HttpError, string>({
    mutationFn: deleteGeneration,
    onSuccess: () => qc.invalidateQueries({ queryKey: HISTORY_KEY }),
  });
};
