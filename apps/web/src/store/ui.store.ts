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
	if (typeof document === 'undefined') return;
	if (dark) {
		document.documentElement.classList.add('dark');
	} else {
		document.documentElement.classList.remove('dark');
	}
}

function getInitialDarkMode() {
	if (typeof window === 'undefined') return false;

	try {
		const persisted = window.localStorage.getItem('ui-prefs');
		if (persisted) {
			const parsed = JSON.parse(persisted) as {
				state?: { darkMode?: boolean };
			};
			if (typeof parsed.state?.darkMode === 'boolean') {
				applyDarkMode(parsed.state.darkMode);
				return parsed.state.darkMode;
			}
		}
	} catch {
		// Fall through to system preference if persisted preferences are invalid.
	}

	const systemDark =
		window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
	applyDarkMode(systemDark);
	return systemDark;
}

export const useUiStore = create<UiState>()(
	persist(
		(set, get) => ({
			sidebarCollapsed: false,
			darkMode: getInitialDarkMode(),
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
				applyDarkMode(state?.darkMode ?? getInitialDarkMode());
			},
		},
	),
);
