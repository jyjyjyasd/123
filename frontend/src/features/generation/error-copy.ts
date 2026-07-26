export const ERROR_COPY: Record<string, string> = {
  content_policy: "Prompt 触发了内容审核，请调整描述后重试",
  rate_limited: "代理 API 当前繁忙或额度不足，请稍后再试或联系管理员",
  upstream_error: "代理服务暂时不可用，请稍后重试",
  timeout: "生成超时（>180s），可能图较复杂，请重试或降低质量",
  invalid_input: "参数有误，请检查 prompt 和选项",
  not_found: "任务不存在",
  unauthenticated: "登录已过期，请重新登录",
  forbidden: "你没有权限执行这个操作",
  unknown: "未知错误，请重试",
};

export const errorMessage = (code: string | null, fallback?: string): string => {
  if (!code) return fallback ?? ERROR_COPY.unknown;
  return ERROR_COPY[code] ?? fallback ?? code;
};
