import { useEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LocalStorageKeys } from '@/utils/local-storage';

export type Theme = 'light' | 'dark' | 'system';

// --- DOM utility ---

export function resolveTheme(theme: Theme): boolean {
    if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return theme === 'dark';
}

export function applyTheme(theme: Theme): void {
    const dark = resolveTheme(theme);
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
}

// Eagerly apply the persisted theme before the first React render.
try {
    const raw = localStorage.getItem(LocalStorageKeys.Theme);
    const s = raw ? (JSON.parse(raw) as { state?: { theme?: Theme; darkMode?: boolean } }) : null;
    // Support old boolean `darkMode` from before migration
    const theme: Theme = s?.state?.theme ?? (s?.state?.darkMode === false ? 'light' : 'dark');
    applyTheme(theme);
} catch {
    // Keep the dark default already set on <html class="dark"> in index.html
}

// --- Store ---

interface ThemeState {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    /** Toggle between dark and light, ignoring/overriding system. */
    toggleDarkMode: () => void;
    /** Current effective dark value (system resolves to OS preference). */
    darkMode: boolean;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            theme: 'dark',
            get darkMode() {
                return resolveTheme(get().theme);
            },
            setTheme: (theme) => set({ theme }),
            toggleDarkMode: () => {
                const currentlyDark = resolveTheme(get().theme);
                set({ theme: currentlyDark ? 'light' : 'dark' });
            }
        }),
        {
            name: LocalStorageKeys.Theme,
            storage: createJSONStorage(() => localStorage),
            // Migrate old boolean `darkMode` field
            migrate: (persisted: any) => {
                if (typeof persisted?.darkMode === 'boolean') {
                    return { theme: persisted.darkMode ? 'dark' : 'light' };
                }
                return persisted;
            },
            version: 1
        }
    )
);

// --- Hook ---

/**
 * Syncs the persisted theme preference to the DOM.
 * - Re-applies when the OS preference changes (relevant for 'system').
 * - Syncs theme changes made in other tabs via the storage event.
 * Mount once at the app root.
 */
export function useTheme(): void {
    const theme = useThemeStore((s) => s.theme);
    const setTheme = useThemeStore((s) => s.setTheme);

    // Apply to DOM and track OS preference changes when on 'system'
    useEffect(() => {
        applyTheme(theme);

        if (theme !== 'system') {
            return;
        }

        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => applyTheme('system');
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [theme]);

    // Sync theme changes from other tabs
    useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key !== LocalStorageKeys.Theme || !e.newValue) {
                return;
            }
            try {
                const parsed = JSON.parse(e.newValue) as { state?: { theme?: Theme } };
                const incoming = parsed?.state?.theme;
                if (incoming && incoming !== useThemeStore.getState().theme) {
                    setTheme(incoming);
                }
            } catch {
                // ignore malformed storage values
            }
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [setTheme]);
}
