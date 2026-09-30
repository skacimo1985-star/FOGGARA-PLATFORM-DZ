export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let sessionToken: string | null = null;
// Remove legacy tokens; authentication is held in memory only.
localStorage.removeItem("token");

export function setToken(token: string | null) {
  sessionToken = token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  const token = sessionToken;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, "NETWORK", "network error");
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
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, file: File) => request<T>(path, {
    method: "POST", body: file, headers: { "Content-Type": file.type },
  }),
  download: async (path: string, filename: string) => {
    const response = await fetch(`/api${path}`, { headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {} });
    if (!response.ok) throw new ApiError(response.status, "FORBIDDEN", response.statusText);
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
