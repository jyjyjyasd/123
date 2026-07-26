import { Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/layout/app-layout";
import { RequireAuth } from "@/features/auth/RequireAuth";
import LoginPage from "@/pages/login";
import AdminPage from "@/pages/admin";
import GenerationDetailPage from "@/pages/generation-detail";
import WorkspacePage from "@/pages/workspace";

const NotFound = () => (
  <div className="flex h-full items-center justify-center">
    <div className="text-text-tertiary">404 · 页面不存在</div>
  </div>
);

const App = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />

    <Route
      element={
        <RequireAuth>
          <AppLayout />
        </RequireAuth>
      }
      >
      <Route path="/" element={<WorkspacePage />} />
      <Route path="/generation/:jobId" element={<GenerationDetailPage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Route>

    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default App;
