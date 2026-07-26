import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { HttpError } from "@/lib/api";
import { ME_KEY } from "@/features/auth/hooks";
import {
  type AdminGalleryFilter,
  type AdminGalleryPage,
  type AdminGenerationDetail,
  type AdminSession,
  type AdminStats,
  type AdminStorage,
  type AdminUser,
  elevateAdmin,
  fetchAdminGallery,
  fetchAdminGenerationDetail,
  fetchAdminStats,
  fetchAdminStorage,
  fetchAdminUsers,
  lockAdmin,
} from "./api";

export const ADMIN_STATS_KEY = ["admin", "stats"] as const;

export const useAdminElevate = () => {
  const qc = useQueryClient();
  return useMutation<AdminSession, HttpError, string>({
    mutationFn: elevateAdmin,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ME_KEY });
      await qc.invalidateQueries({ queryKey: ADMIN_STATS_KEY });
    },
  });
};

export const useAdminLock = () => {
  const qc = useQueryClient();
  return useMutation<null, HttpError, void>({
    mutationFn: lockAdmin,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ME_KEY });
      qc.removeQueries({ queryKey: ADMIN_STATS_KEY });
    },
  });
};

export const useAdminStats = (enabled: boolean) =>
  useQuery<AdminStats, HttpError>({
    queryKey: ADMIN_STATS_KEY,
    queryFn: fetchAdminStats,
    enabled,
    staleTime: 10_000,
  });

export const ADMIN_GALLERY_KEY = ["admin", "gallery"] as const;

export const useAdminGallery = (
  enabled: boolean,
  filter: AdminGalleryFilter = {},
) =>
  useInfiniteQuery<AdminGalleryPage, HttpError>({
    queryKey: [...ADMIN_GALLERY_KEY, filter],
    queryFn: ({ pageParam }) =>
      fetchAdminGallery((pageParam as string | null) ?? null, filter),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : undefined),
    enabled,
    staleTime: 5_000,
  });

export const useAdminGenerationDetail = (id: string | null) =>
  useQuery<AdminGenerationDetail, HttpError>({
    queryKey: ["admin", "generation", id],
    queryFn: () => fetchAdminGenerationDetail(id!),
    enabled: !!id,
  });

export const ADMIN_STORAGE_KEY = ["admin", "storage"] as const;

export const useAdminStorage = (enabled: boolean) =>
  useQuery<AdminStorage, HttpError>({
    queryKey: ADMIN_STORAGE_KEY,
    queryFn: fetchAdminStorage,
    enabled,
    staleTime: 30_000,
  });

export const useAdminUsers = (q: string, enabled: boolean) =>
  useQuery<AdminUser[], HttpError>({
    queryKey: ["admin", "users", q],
    queryFn: () => fetchAdminUsers(q),
    enabled,
    staleTime: 5_000,
  });
