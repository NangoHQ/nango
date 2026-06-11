import { useEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LocalStorageKeys } from '@/utils/local-storage';

export type Theme = 'light' | 'dark' | 'system';

// Dark is the default for now so existing users keep the current look and new users
// don't land on light mode at rollout. Revisit defaulting to 'system' once light mode
// has been live for a while. Keep index.html's pre-paint fallback in sync with this.
const DEFAULT_THEME: Theme = 'dark';

// --- DOM utility ---

export function resolveTheme(theme: Theme): boolean {
    if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return theme === 'dark';
}

export function applyTheme(theme: Theme): void {
    const dark = resolveTheme(theme);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

function getStoredTheme(): Theme {
    try {
        const raw = localStorage.getItem(LocalStorageKeys.Theme);
        const s = raw ? (JSON.parse(raw) as { state?: { theme?: Theme; darkMode?: boolean } }) : null;
        return s?.state?.theme ?? (s?.state?.darkMode === false ? 'light' : DEFAULT_THEME);
    } catch {
        return DEFAULT_THEME;
    }
}

// Eagerly apply the persisted theme before the first React render.
// Module code runs synchronously before ReactDOM.render().
try {
    applyTheme(getStoredTheme());
} catch {
    // Keep the dark default already set via data-theme in index.html
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
