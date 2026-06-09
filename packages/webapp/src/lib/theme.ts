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

function getStoredTheme(): Theme {
    try {
        const raw = localStorage.getItem(LocalStorageKeys.Theme);
        const s = raw ? (JSON.parse(raw) as { state?: { theme?: Theme; darkMode?: boolean } }) : null;
        return s?.state?.theme ?? (s?.state?.darkMode === false ? 'light' : 'dark');
    } catch {
        return 'dark';
    }
}

// Eagerly apply the persisted theme before the first React render.
// Module code runs synchronously before ReactDOM.render().
try {
    applyTheme(getStoredTheme());
} catch {
    // Keep the dark default already set on <html class="dark"> in index.html
}

// --- Store ---

interface ThemeState {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    /** Toggle between dark and light, ignoring/overriding system. */
    toggleDarkMode: () => void;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            // Initialize from localStorage so first render has the correct value
            // (avoids a flash when persist hydrates asynchronously)
            theme: getStoredTheme(),
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

/** Derived selector: current effective dark value (system resolves to OS preference). */
export const darkModeSelector = (s: ThemeState) => resolveTheme(s.theme);

// --- Hook ---

/**
 * Syncs the persisted theme preference to the DOM.
 * Also re-applies when the OS preference changes (relevant for 'system').
 * Mount once at the app root.
 */
export function useTheme(): void {
    const theme = useThemeStore((s) => s.theme);
    const setTheme = useThemeStore((s) => s.setTheme);

    useEffect(() => {
        applyTheme(theme);

        if (theme !== 'system') {
            return;
        }

        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => applyTheme('system');
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [theme, setTheme]);
}
