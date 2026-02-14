import axios from 'axios';
import { API_BASE_URL, getApiBaseUrl } from '@/config/env';

export { API_BASE_URL };

export const createApiClient = (options?: {
	tokenStorageKey?: string;
	timeout?: number;
}) => {
	const instance = axios.create({
		baseURL: getApiBaseUrl(),
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
		error => Promise.reject(error),
	);

	return instance;
};
