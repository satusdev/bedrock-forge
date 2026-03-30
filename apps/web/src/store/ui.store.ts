import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
	sidebarCollapsed: boolean;
	darkMode: boolean;
	setSidebarCollapsed: (v: boolean) => void;
	toggleSidebar: () => void;
	setDarkMode: (v: boolean) => void;
	toggleDarkMode: () => void;
}

function applyDarkMode(dark: boolean) {
	if (dark) {
		document.documentElement.classList.add('dark');
	} else {
		document.documentElement.classList.remove('dark');
	}
}

export const useUiStore = create<UiState>()(
	persist(
		(set, get) => ({
			sidebarCollapsed: false,
			darkMode: false,
			setSidebarCollapsed: v => set({ sidebarCollapsed: v }),
			toggleSidebar: () =>
				set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
			setDarkMode: v => {
				applyDarkMode(v);
				set({ darkMode: v });
			},
			toggleDarkMode: () => {
				const next = !get().darkMode;
				applyDarkMode(next);
				set({ darkMode: next });
			},
		}),
		{
			name: 'ui-prefs',
			partialize: s => ({
				sidebarCollapsed: s.sidebarCollapsed,
				darkMode: s.darkMode,
			}),
			onRehydrateStorage: () => state => {
				// Apply dark mode class immediately on hydration
				if (state?.darkMode) applyDarkMode(true);
			},
		},
	),
);
