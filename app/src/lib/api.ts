export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}

const DEFAULT_TIMEOUT_MS = 20_000;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // مهلة افتراضية لكل طلب — تمنع تعليق الواجهة عند شبكة بطيئة (معرض/ميدان)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...options, headers, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "TIMEOUT", "request timeout");
    }
    throw new ApiError(0, "NETWORK", "network error");
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) {
      // جلسة منتهية/غير صالحة: إسقاط الرمز وإعادة التوجيه لتسجيل الدخول من الصفحات المحمية
      setToken(null);
      if (window.location.pathname.startsWith("/app")) {
        window.location.assign("/login");
      }
    }
    const detail = body?.detail;
    const code = typeof detail === "object" && detail?.code ? detail.code : "ERROR";
    const message = typeof detail === "object" && detail?.message ? detail.message : res.statusText;
    throw new ApiError(res.status, code, message);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
};
