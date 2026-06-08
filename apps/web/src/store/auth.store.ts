import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: number;
  email: string;
  name: string;
  roles: string[];
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  setAccessToken: (access: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

/** Decode a JWT payload (no signature verification — just read the exp claim). */
export function getTokenExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/** Returns true if the token is missing or its exp is ≤ now. */
export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
  const exp = getTokenExp(token);
  if (exp === null) return false; // no exp claim → treat as valid
  return exp * 1000 <= Date.now();
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) => set({ user }),
      logout: () => {
        set({ user: null, accessToken: null });
      },
    }),
    {
      name: "auth-storage",
      // Only persist the short-lived access token and user profile. Refresh
      // sessions are restored from an httpOnly cookie, never from JS storage.
      partialize: (s) => ({
        accessToken: s.accessToken,
        user: s.user,
      }),
      // On rehydration from localStorage, drop expired access tokens immediately.
      // Refresh tokens are intentionally memory-only, so an expired persisted
      // access token cannot be refreshed after a full browser reload.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (isTokenExpired(state.accessToken)) {
          state.accessToken = null;
          state.user = null;
        }
      },
    },
  ),
);
