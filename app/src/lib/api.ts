import { collectPages } from "./pagination";

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export class ApiError extends Error {
  code: string;
  status: number;
  retryAfter: number | null;
  constructor(status: number, code: string, message: string, retryAfter: number | null = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const TOKEN_KEY = "fg_session";

let sessionToken: string | null = null;
// Remove legacy localStorage tokens; session is now in sessionStorage.
try { localStorage.removeItem("token"); } catch { /* Storage may be blocked. */ }
// Restore token from sessionStorage so a page reload preserves the session.
try { sessionToken = sessionStorage.getItem(TOKEN_KEY); } catch { /* Storage may be blocked. */ }

export function setToken(token: string | null) {
  sessionToken = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* Storage may be blocked. */ }
}

export function getToken(): string | null {
  return sessionToken;
}

const DEFAULT_TIMEOUT_MS = 20_000;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  const token = sessionToken;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const controller = new AbortController();
  const isLongRunningAnalysis = path.startsWith("/remote-sensing/catalog/scenes/") && path.includes("/statistics?");
  const isLongRunningStudy = path.startsWith("/remote-sensing/studies/");
  const timeoutMs = isLongRunningStudy
    ? 120_000
    : path.startsWith("/auth/") || path === "/org/invitations/accept" || isLongRunningAnalysis
      ? 60_000
      : DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  let body;
  try {
    res = await fetch(`/api${path}`, { ...options, headers, signal: controller.signal });
    body = await res.json().catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      return null;
    });
  } catch (err) {
    if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
      throw new ApiError(0, "TIMEOUT", "request timeout");
    }
    throw new ApiError(0, "NETWORK", "network error");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    if (res.status === 401 && body?.detail?.code !== "BAD_CREDENTIALS") {
      setToken(null);
      if (window.location.pathname.startsWith("/app")) {
        window.location.assign("/login");
      }
    }
    const detail = body?.detail;
    const code = typeof detail === "object" && detail?.code ? detail.code : "ERROR";
    const message = typeof detail === "object" && detail?.message ? detail.message : res.statusText;
    const seconds = Number(res.headers.get("Retry-After"));
    const retryAfter = seconds > 0 && Number.isFinite(seconds) ? Math.min(900, Math.ceil(seconds)) : null;
    throw new ApiError(res.status, code, message, retryAfter);
  }
  if (body === null) throw new ApiError(0, "INVALID_RESPONSE", "Unexpected server response");
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  getAll: <T>(path: string) => collectPages<T>((page) => {
    const [pathname, query = ""] = path.split("?");
    const params = new URLSearchParams(query);
    params.set("page", String(page));
    params.set("page_size", "100");
    return request<Paged<T>>(`${pathname}?${params}`);
  }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, file: File) => request<T>(path, {
    method: "POST", body: file, headers: { "Content-Type": file.type },
  }),
  getBlob: async (path: string, timeoutMs = 60_000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`/api${path}`, {
        headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (response.status === 401) {
          setToken(null);
          if (window.location.pathname.startsWith("/app")) window.location.assign("/login");
        }
        throw new ApiError(
          response.status,
          body?.detail?.code ?? "ERROR",
          body?.detail?.message ?? response.statusText,
        );
      }
      return await response.blob();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, controller.signal.aborted ? "TIMEOUT" : "NETWORK", "blob request failed");
    } finally {
      clearTimeout(timer);
    }
  },
  download: async (path: string, filename: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    let blob: Blob;
    try {
      const response = await fetch(`/api${path}`, {
        headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (response.status === 401) {
          setToken(null);
          if (window.location.pathname.startsWith("/app")) window.location.assign("/login");
        }
        throw new ApiError(response.status, body?.detail?.code ?? "ERROR", body?.detail?.message ?? response.statusText);
      }
      blob = await response.blob();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, controller.signal.aborted ? "TIMEOUT" : "NETWORK", "download failed");
    } finally { clearTimeout(timer); }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
