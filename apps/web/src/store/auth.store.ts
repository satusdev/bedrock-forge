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
	refreshToken: string | null;
	setTokens: (access: string, refresh: string) => void;
	setUser: (user: User) => void;
	logout: () => void;
}

export const useAuthStore = create<AuthState>()(
	persist(
		set => ({
			user: null,
			accessToken: null,
			refreshToken: null,
			setTokens: (accessToken, refreshToken) =>
				set({ accessToken, refreshToken }),
			setUser: user => set({ user }),
			logout: () => set({ user: null, accessToken: null, refreshToken: null }),
		}),
		{
			name: 'auth-storage',
			partialize: s => ({
				accessToken: s.accessToken,
				refreshToken: s.refreshToken,
				user: s.user,
			}),
		},
	),
);
