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

// Eagerly apply the persisted theme before the first React render.
// Module code runs synchronously before ReactDOM.render(), so this prevents
// a flash when the user has previously toggled to light mode.
try {
    const raw = localStorage.getItem(LocalStorageKeys.Theme);
    const s = raw ? (JSON.parse(raw) as { state?: { darkMode?: boolean } }) : null;
    applyTheme(s?.state?.darkMode ?? true);
} catch {
    // Keep the dark default already set on <html class="dark"> in index.html
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
