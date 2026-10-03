import { useCallback, useState, type ReactNode } from "react";
import { api, setToken } from "@/lib/api";
import type { User } from "@/types";

import { AuthContext } from "@/context/useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const loading = false;

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

