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

// Proactive expiry timer — fires 60 s before the token expires so we
// can call logout() (which then triggers the SessionGuard navigation).
let _expiryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleExpiry(token: string | null, logout: () => void) {
	if (_expiryTimer) {
		clearTimeout(_expiryTimer);
		_expiryTimer = null;
	}
	if (!token) return;
	const exp = getTokenExp(token);
	if (exp === null) return;
	const msUntilExpiry = exp * 1000 - Date.now();
	// Fire 60 s early so the user is redirected cleanly before the token dies.
	// If already expired, fire immediately (next tick).
	const delay = Math.max(0, msUntilExpiry - 60_000);
	_expiryTimer = setTimeout(() => {
		logout();
	}, delay);
}

export const useAuthStore = create<AuthState>()(
	persist(
		(set, get) => ({
			user: null,
			accessToken: null,
			refreshToken: null,
			setTokens: (accessToken, refreshToken) => {
				set({ accessToken, refreshToken });
				scheduleExpiry(accessToken, get().logout);
			},
			setUser: user => set({ user }),
			logout: () => {
				if (_expiryTimer) {
					clearTimeout(_expiryTimer);
					_expiryTimer = null;
				}
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
			// On rehydration from localStorage, drop expired tokens immediately
			// so PrivateRoute shows login on the very first render.
			onRehydrateStorage: () => state => {
				if (!state) return;
				if (isTokenExpired(state.accessToken)) {
					state.accessToken = null;
					state.user = null;
				} else {
					// Resume the expiry timer after a page reload.
					scheduleExpiry(state.accessToken, state.logout);
				}
			},
		},
	),
);
