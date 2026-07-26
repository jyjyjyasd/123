export type ApiError = {
  code: string;
  message: string;
  status: number;
};

export class HttpError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(error: ApiError) {
    super(error.message);
    this.code = error.code;
    this.status = error.status;
  }
}

type Init = Omit<RequestInit, "body"> & {
  body?: unknown;
  json?: unknown;
};

export const api = async <T = unknown>(path: string, init: Init = {}): Promise<T> => {
  const headers = new Headers(init.headers ?? {});
  let body: BodyInit | undefined;

  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  } else if (init.body !== undefined) {
    // FormData / Blob etc — let fetch set Content-Type
    body = init.body as BodyInit;
  }

  const res = await fetch(path, {
    ...init,
    headers,
    body,
    credentials: "include",
  });

  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = (payload?.detail?.error ?? payload?.error) as
      | { code?: string; message?: string }
      | undefined;
    throw new HttpError({
      code: err?.code ?? "unknown",
      message: err?.message ?? `HTTP ${res.status}`,
      status: res.status,
    });
  }

  return payload as T;
};

type UploadOptions = {
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
};

/**
 * POST a FormData with real upload progress.
 *
 * fetch() has no upload-progress event; XHR is the only stable browser API
 * for `upload.onprogress`. Keep error shape and credentials behavior aligned
 * with `api()` so callers don't need a separate error path.
 */
export const apiUpload = <T = unknown>(
  path: string,
  formData: FormData,
  { onProgress, signal }: UploadOptions = {},
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.withCredentials = true;

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total);
      });
    }

    xhr.addEventListener("load", () => {
      const text = xhr.responseText;
      let payload: unknown = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        // non-JSON body (HTML error page, etc.) — keep payload as null
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload as T);
        return;
      }
      const p = payload as
        | { detail?: { error?: { code?: string; message?: string } }; error?: { code?: string; message?: string } }
        | null;
      const err = p?.detail?.error ?? p?.error;
      reject(
        new HttpError({
          code: err?.code ?? "unknown",
          message: err?.message ?? `HTTP ${xhr.status}`,
          status: xhr.status,
        }),
      );
    });

    xhr.addEventListener("error", () => {
      reject(new HttpError({ code: "network_error", message: "网络错误", status: 0 }));
    });

    xhr.addEventListener("abort", () => {
      reject(new HttpError({ code: "aborted", message: "已取消", status: 0 }));
    });

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
      } else {
        signal.addEventListener("abort", () => xhr.abort(), { once: true });
      }
    }

    xhr.send(formData);
  });
