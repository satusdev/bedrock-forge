import axios from 'axios';

export const API_BASE_URL =
	import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

export const createApiClient = (options?: {
	tokenStorageKey?: string;
	timeout?: number;
}) => {
	const instance = axios.create({
		baseURL: API_BASE_URL,
		timeout: options?.timeout ?? 60000,
		headers: {
			'Content-Type': 'application/json',
		},
	});

	instance.interceptors.request.use(
		config => {
			const tokenKey = options?.tokenStorageKey;
			if (tokenKey) {
				const token = localStorage.getItem(tokenKey);
				if (token) {
					config.headers.Authorization = `Bearer ${token}`;
				}
			}
			return config;
		},
		error => Promise.reject(error)
	);

	return instance;
};
