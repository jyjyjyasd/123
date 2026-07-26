import { api } from "@/lib/api";

export type Me = {
  id: string;
  work_id: string;
  name: string;
  is_admin: boolean;
  is_admin_elevated: boolean;
};

export const fetchMe = (): Promise<Me> => api<Me>("/api/me");

export const login = (work_id: string): Promise<Me> =>
  api<Me>("/api/auth/login", { method: "POST", json: { work_id } });

export const logout = (): Promise<null> =>
  api<null>("/api/auth/logout", { method: "POST" });
