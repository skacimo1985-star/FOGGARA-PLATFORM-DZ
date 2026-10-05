import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "@/lib/api";
import type { User } from "@/types";

import { AuthContext } from "@/context/useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  useEffect(() => {
    const token = getToken();

    // loading is already false if no persisted token exists.
    if (!token) return;

    let cancelled = false;

    api
      .get<User>("/auth/me")
      .then((u) => {
        if (!cancelled) {
          setUser(u);
        }
      })
      .catch(() => {
        setToken(null);

        if (!cancelled) {
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const startSession = useCallback(
    (result: { token: string; user: User }) => {
      setToken(result.token);
      setUser(result.user);
      setLoading(false);
    },
    [],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.post<{ token: string; user: User }>(
        "/auth/login",
        { email, password },
      );

      startSession(result);
    },
    [startSession],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setLoading(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        startSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
