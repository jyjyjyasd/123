import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useMe } from "./hooks";

export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { data, isPending, error } = useMe();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center text-text-tertiary text-sm">
        加载中…
      </div>
    );
  }

  if (error || !data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};
