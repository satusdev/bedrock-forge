const ensureString = (value: unknown, fallback = ''): string => {
	if (typeof value === 'string') {
		return value;
	}
	if (value == null) {
		return fallback;
	}
	return String(value);
};

const normalizeUrl = (value: unknown) =>
	ensureString(value).replace(/\/+$/, '');

const normalizeApiPrefix = (value: unknown) => {
	const stringValue = ensureString(value, '/api/v1').trim() || '/api/v1';

	if (stringValue === '/') {
		return '/';
	}
	const prefixed = stringValue.startsWith('/')
		? stringValue
		: `/${stringValue}`;
	return prefixed.replace(/\/+$/, '');
};

const FALLBACK_ORIGIN =
	typeof window !== 'undefined'
		? window.location.origin
		: 'http://localhost:8000';

const DEFAULT_API_PREFIX = normalizeApiPrefix(
	import.meta.env.VITE_API_PREFIX || '/api/v1',
);

const DEFAULT_API_BASE_URL = `${FALLBACK_ORIGIN}${DEFAULT_API_PREFIX}`;

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
export const HEALTH_URL = `${API_BASE_URL}/health`;

export const getApiBaseUrl = () => {
	const safeApiBaseUrl = ensureString(API_BASE_URL);

	if (typeof window === 'undefined') {
		return safeApiBaseUrl;
	}
	if (
		window.location.protocol === 'https:' &&
		safeApiBaseUrl.startsWith('http://')
	) {
		return safeApiBaseUrl.replace(/^http:\/\//, 'https://');
	}
	return safeApiBaseUrl;
};

export const getApiUrl = (path: string) => {
	const value = ensureString(path).trim();
	if (!value) {
		return getApiBaseUrl();
	}

	if (/^https?:\/\//i.test(value)) {
		return value;
	}

	let normalizedPath = value;
	if (normalizedPath.startsWith('/api/v1/')) {
		normalizedPath = normalizedPath.slice('/api/v1'.length);
	} else if (normalizedPath === '/api/v1') {
		normalizedPath = '/';
	} else if (normalizedPath.startsWith('/api/')) {
		normalizedPath = normalizedPath.slice('/api'.length);
	} else if (normalizedPath === '/api') {
		normalizedPath = '/';
	}

	if (!normalizedPath.startsWith('/')) {
		normalizedPath = `/${normalizedPath}`;
	}

	return `${getApiBaseUrl().replace(/\/+$/, '')}${normalizedPath}`;
};

export const apiFetch = (path: string, init?: RequestInit) =>
	fetch(getApiUrl(path), init);

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
