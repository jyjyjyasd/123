import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { HttpError } from "@/lib/api";
import { fetchMe, login, logout, type Me } from "./api";

export const ME_KEY = ["me"] as const;

export const useMe = () =>
  useQuery<Me, HttpError>({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    retry: (count, error) => {
      if (error.status === 401) return false;
      return count < 1;
    },
  });

export const useLogin = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation<Me, HttpError, string>({
    mutationFn: login,
    onSuccess: (me) => {
      qc.setQueryData(ME_KEY, me);
      navigate("/", { replace: true });
    },
  });
};

export const useLogout = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      qc.setQueryData(ME_KEY, null);
      qc.invalidateQueries({ queryKey: ME_KEY });
      navigate("/login", { replace: true });
    },
  });
};
