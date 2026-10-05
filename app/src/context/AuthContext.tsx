import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "@/lib/api";
import type { User } from "@/types";

import { AuthContext } from "@/context/useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => !!getToken());

  // Restore session on mount if a token was persisted in sessionStorage.
  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    setLoading(true);
    api.get<User>("/auth/me")
      .then((u) => { setUser(u); })
      .catch(() => { setToken(null); })
      .finally(() => { setLoading(false); });
  }, []);

  const startSession = useCallback((result: { token: string; user: User }) => {
    setToken(result.token); setUser(result.user);
  }, []);
  const login = useCallback(async (email: string, password: string) => {
    startSession(await api.post<{ token: string; user: User }>("/auth/login", { email, password }));
  }, [startSession]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, startSession }}>
      {children}
    </AuthContext.Provider>
  );
}
