import { useEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LocalStorageKeys } from '@/utils/local-storage';

// --- DOM utility ---

export function applyTheme(dark: boolean): void {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
}

// --- Store ---

interface ThemeState {
    darkMode: boolean;
    toggleDarkMode: () => void;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            // Default to dark mode to match the existing app default
            darkMode: true,
            toggleDarkMode: () => set({ darkMode: !get().darkMode })
        }),
        {
            name: LocalStorageKeys.Theme,
            storage: createJSONStorage(() => localStorage)
        }
    )
);

// --- Hook ---

/**
 * Syncs the persisted dark-mode preference to the DOM.
 * Mount once at the app root; consumers that only need to read
 * or toggle the value can import useThemeStore directly.
 */
export function useTheme(): void {
    const darkMode = useThemeStore((s) => s.darkMode);
    useEffect(() => {
        applyTheme(darkMode);
    }, [darkMode]);
}
