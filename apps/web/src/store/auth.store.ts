import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
	id: number;
	email: string;
	name: string;
	roles: string[];
}

interface AuthState {
	user: User | null;
	accessToken: string | null;
	/** Refresh token is kept in-memory only — never written to localStorage. */
	refreshToken: string | null;
	setTokens: (access: string, refresh: string) => void;
	setUser: (user: User) => void;
	logout: () => void;
}

/** Decode a JWT payload (no signature verification — just read the exp claim). */
export function getTokenExp(token: string): number | null {
	try {
		const payload = JSON.parse(atob(token.split('.')[1]));
		return typeof payload.exp === 'number' ? payload.exp : null;
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
		set => ({
			user: null,
			accessToken: null,
			refreshToken: null,
			setTokens: (accessToken, refreshToken) => {
				set({ accessToken, refreshToken });
			},
			setUser: user => set({ user }),
			logout: () => {
				set({ user: null, accessToken: null, refreshToken: null });
			},
		}),
		{
			name: 'auth-storage',
			// Only persist the short-lived access token and user profile.
			// The refresh token is intentionally excluded: storing it in localStorage
			// would allow any XSS payload to silently steal a long-lived credential.
			partialize: s => ({
				accessToken: s.accessToken,
				user: s.user,
			}),
			// On rehydration from localStorage, drop expired access tokens immediately.
			// Refresh tokens are intentionally memory-only, so an expired persisted
			// access token cannot be refreshed after a full browser reload.
			onRehydrateStorage: () => state => {
				if (!state) return;
				if (isTokenExpired(state.accessToken)) {
					state.accessToken = null;
					state.user = null;
				}
			},
		},
	),
);
