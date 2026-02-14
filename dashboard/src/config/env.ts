const normalizeUrl = (value: string) => value.replace(/\/+$/, '');

const FALLBACK_ORIGIN =
	typeof window !== 'undefined'
		? window.location.origin
		: 'http://localhost:8000';

const DEFAULT_API_BASE_URL = `${FALLBACK_ORIGIN}/api/v1`;

const resolvedApiBase = normalizeUrl(
	import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL,
);

const resolveApiUrl = () => {
	try {
		return new URL(resolvedApiBase, FALLBACK_ORIGIN);
	} catch {
		return new URL(DEFAULT_API_BASE_URL);
	}
};

const enforceHttpsInBrowser = (url: URL) => {
	if (typeof window === 'undefined') {
		return url;
	}
	if (window.location.protocol === 'https:' && url.protocol === 'http:') {
		const httpsUrl = new URL(url.toString());
		httpsUrl.protocol = 'https:';
		return httpsUrl;
	}
	return url;
};

const apiUrl = enforceHttpsInBrowser(resolveApiUrl());

export const API_BASE_URL = normalizeUrl(apiUrl.toString());
export const API_ORIGIN = apiUrl.origin;
export const HEALTH_URL = `${API_ORIGIN}/health`;

export const getApiBaseUrl = () => {
	if (typeof window === 'undefined') {
		return API_BASE_URL;
	}
	if (
		window.location.protocol === 'https:' &&
		API_BASE_URL.startsWith('http://')
	) {
		return API_BASE_URL.replace(/^http:\/\//, 'https://');
	}
	return API_BASE_URL;
};

const explicitWsBase = import.meta.env.VITE_WS_URL;

const deriveWsBaseUrl = () => {
	const wsUrl = new URL(apiUrl.toString());
	wsUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
	wsUrl.pathname = `${apiUrl.pathname.replace(/\/$/, '')}/ws`;
	wsUrl.search = '';
	wsUrl.hash = '';
	return normalizeUrl(wsUrl.toString());
};

export const WS_BASE_URL = normalizeUrl(
	explicitWsBase ? explicitWsBase : deriveWsBaseUrl(),
);

export const getWebSocketUrl = (clientId: string) => {
	const safeClientId = encodeURIComponent(clientId);
	return `${WS_BASE_URL}/${safeClientId}`;
};
