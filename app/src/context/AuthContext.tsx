import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { api, setToken } from "@/lib/api";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  startSession: (result: { token: string; user: User }) => void;
}

const AuthContext = createContext<AuthState | null>(null);

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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
