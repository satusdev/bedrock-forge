import { useAuthStore } from '@/store/auth.store';
import { updateSocketToken } from './websocket';

const BASE = '/api';

// Mutex: ensures only one token refresh is in-flight at a time.
// Concurrent 401s await the same promise instead of each triggering their own
// refresh (which would invalidate the rotation chain).
let _refreshPromise: Promise<string | null> | null = null;

async function refreshTokens(): Promise<string | null> {
	if (_refreshPromise) return _refreshPromise;

	_refreshPromise = (async () => {
		const { refreshToken, setTokens, logout } = useAuthStore.getState();
		if (!refreshToken) {
			logout();
			return null;
		}
		try {
			const res = await fetch(`${BASE}/auth/refresh`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ refreshToken }),
			});
			if (!res.ok) {
				logout();
				return null;
			}
			const data = await res.json();
			setTokens(data.accessToken, data.refreshToken);
			updateSocketToken(data.accessToken as string);
			return data.accessToken as string;
		} catch {
			logout();
			return null;
		} finally {
			_refreshPromise = null;
		}
	})();

	return _refreshPromise;
}

export async function apiFetch<T>(
	path: string,
	init: RequestInit = {},
): Promise<T> {
	const { accessToken } = useAuthStore.getState();

	const doFetch = (token: string | null) =>
		fetch(`${BASE}${path}`, {
			...init,
			headers: {
				'Content-Type': 'application/json',
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...(init.headers ?? {}),
			},
		});

	let res = await doFetch(accessToken);

	if (res.status === 401) {
		const newToken = await refreshTokens();
		if (!newToken) throw new Error('Unauthorized');
		res = await doFetch(newToken);
	}

	if (!res.ok) {
		const err = await res.json().catch(() => ({ message: res.statusText }));
		throw new Error(err?.message ?? 'API error');
	}

	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

// Convenience helpers
export const api = {
	get: <T>(path: string) => apiFetch<T>(path),
	post: <T>(path: string, body: unknown) =>
		apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
	put: <T>(path: string, body: unknown) =>
		apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
	delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
	patch: <T>(path: string, body: unknown) =>
		apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
};
