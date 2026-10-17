/**
 * CAUSAL — Authentication Context.
 *
 * Provides:
 *   - useAuth() hook: user, isLoading, isAuthenticated, login, register, logout
 *   - Token stored in localStorage (key: "causal_access_token")
 *   - Session restoration on load via GET /api/v1/auth/me
 *   - All auth calls go to the real FastAPI backend — no mocked state
 *
 * Security:
 *   - Plaintext passwords are never stored
 *   - Token is sent only as Bearer header, never in URL
 *   - On logout, token is removed from localStorage and the
 *     backend logout endpoint is called to write an audit record
 */

"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOKEN_KEY = "causal_access_token";

// ── Types ─────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    displayName: string,
    password: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => string | null;
}

// ── Context ───────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getToken = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  }, []);

  const saveToken = useCallback((token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
  }, []);

  const clearToken = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
  }, []);

  /** Authenticated fetch helper — attaches Bearer token automatically. */
  const authFetch = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const token = getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers as Record<string, string> | undefined),
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
      });
      return res;
    },
    [getToken]
  );

  /** Restore session from stored token on app load. */
  const restoreSession = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await authFetch("/api/v1/auth/me");
      if (res.ok) {
        const data: AuthUser = await res.json();
        setUser(data);
      } else {
        clearToken();
      }
    } catch {
      clearToken();
    } finally {
      setIsLoading(false);
    }
  }, [getToken, authFetch, clearToken]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          body?.detail ??
          (res.status === 401
            ? "Invalid email or password."
            : "Authentication failed. Please try again.");
        throw new Error(msg);
      }

      const data: TokenResponse = await res.json();
      saveToken(data.access_token);

      const meRes = await authFetch("/api/v1/auth/me");
      if (!meRes.ok) throw new Error("Failed to retrieve user profile.");
      const me: AuthUser = await meRes.json();
      setUser(me);
    },
    [saveToken, authFetch]
  );

  const register = useCallback(
    async (email: string, displayName: string, password: string) => {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email,
          display_name: displayName,
          password,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        let msg = body?.detail ?? "Registration failed. Please try again.";
        if (Array.isArray(msg)) {
          msg = msg.map((e: { msg?: string }) => e.msg ?? String(e)).join(". ");
        }
        throw new Error(msg);
      }

      const data: TokenResponse = await res.json();
      saveToken(data.access_token);

      const meRes = await authFetch("/api/v1/auth/me");
      if (!meRes.ok) throw new Error("Failed to retrieve user profile.");
      const me: AuthUser = await meRes.json();
      setUser(me);
    },
    [saveToken, authFetch]
  );

  const logout = useCallback(async () => {
    const token = getToken();
    if (token) {
      try {
        await authFetch("/api/v1/auth/logout", { method: "POST" });
      } catch {
        // Ignore network errors on logout
      }
    }
    clearToken();
    setUser(null);
  }, [getToken, authFetch, clearToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      getToken,
    }),
    [user, isLoading, login, register, logout, getToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const defaultAuthValue: AuthContextValue = {
  user: null,
  isLoading: false,
  isAuthenticated: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  getToken: () => null,
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  return ctx ?? defaultAuthValue;
}
