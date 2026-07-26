import { Outlet } from "react-router-dom";

import { TopNav } from "./top-nav";

export const AppLayout = () => (
  <div className="h-full flex flex-col">
    <TopNav />
    <div className="min-h-0 flex-1 overflow-auto">
      <Outlet />
    </div>
  </div>
);
