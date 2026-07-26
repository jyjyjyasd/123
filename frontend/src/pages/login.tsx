import { type FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/layout/brand-mark";
import { useLogin, useMe } from "@/features/auth/hooks";

const ERROR_COPY: Record<string, string> = {
  invalid_input: "工号格式不对（2~32 位字母/数字/._-）",
  unknown: "登录失败，请重试",
};

const LoginPage = () => {
  const me = useMe();
  const login = useLogin();
  const [workId, setWorkId] = useState("");

  if (me.data) return <Navigate to="/" replace />;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!workId.trim()) return;
    login.mutate(workId.trim());
  };

  const errorMsg = login.error
    ? ERROR_COPY[login.error.code] ?? login.error.message
    : null;

  return (
    <div className="flex h-full items-start justify-center bg-bg-primary pt-32">
      <form onSubmit={handleSubmit} className="w-[320px] flex flex-col gap-4">
        <div className="flex flex-col items-center gap-3 mb-2">
          <BrandMark size={48} className="text-text-primary" />
          <div className="text-lg font-semibold text-text-primary">Poster Forge</div>
          <div className="text-sm text-text-tertiary">公司内部视觉物料生成</div>
        </div>

        <Input
          autoFocus
          placeholder="工号"
          value={workId}
          onChange={(e) => setWorkId(e.target.value)}
          disabled={login.isPending}
          aria-label="工号"
        />

        <Button
          type="submit"
          size="lg"
          disabled={login.isPending || workId.trim().length < 2}
        >
          {login.isPending ? "进入中…" : "进入"}
        </Button>

        {errorMsg && (
          <div className="text-sm text-error text-center" role="alert">
            {errorMsg}
          </div>
        )}

        <div className="text-xs text-text-tertiary text-center mt-2">
          首次输入工号会自动建账号；30 天内免登录
        </div>
      </form>
    </div>
  );
};

export default LoginPage;
