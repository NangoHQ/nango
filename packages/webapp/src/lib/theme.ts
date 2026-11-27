import { useEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LocalStorageKeys } from '@/utils/local-storage';

export type Theme = 'light' | 'dark' | 'system';

// index.html's pre-paint script repeats this fallback; change both or the first paint flashes.
const DEFAULT_THEME: Theme = 'system';

const systemDarkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function readSystemDark(): boolean {
    try {
        return systemDarkQuery().matches;
    } catch {
        return false;
    }
}

export function resolveTheme(theme: Theme, systemDark?: boolean): boolean {
    if (theme === 'system') {
        return systemDark ?? readSystemDark();
    }
    return theme === 'dark';
}

export function applyTheme(theme: Theme, systemDark?: boolean): void {
    const dark = resolveTheme(theme, systemDark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

function getStoredTheme(): Theme {
    try {
        const raw = localStorage.getItem(LocalStorageKeys.Theme);
        const s = raw ? (JSON.parse(raw) as { state?: { theme?: Theme; darkMode?: boolean } }) : null;
        if (s?.state?.theme) {
            return s.state.theme;
        }
        if (typeof s?.state?.darkMode === 'boolean') {
            return s.state.darkMode ? 'dark' : 'light';
        }
        return DEFAULT_THEME;
    } catch {
        return DEFAULT_THEME;
    }
}

// Eagerly apply the persisted theme before the first React render.
// Module code runs synchronously before ReactDOM.render().
try {
    applyTheme(getStoredTheme());
} catch {}

// --- Store ---

interface ThemeState {
    theme: Theme;
    // Selectors must read this, not matchMedia. Only a store change re-renders their subscribers.
    systemDark: boolean;
    setTheme: (theme: Theme) => void;
    setSystemDark: (systemDark: boolean) => void;
    /** Toggle between dark and light, ignoring/overriding system. */
    toggleDarkMode: () => void;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            // Initialize from localStorage so first render has the correct value
            // (avoids a flash when persist hydrates asynchronously)
            theme: getStoredTheme(),
            systemDark: readSystemDark(),
            setTheme: (theme) => set({ theme }),
            setSystemDark: (systemDark) => set({ systemDark }),
            toggleDarkMode: () => {
                const currentlyDark = darkModeSelector(get());
                set({ theme: currentlyDark ? 'light' : 'dark' });
            }
        }),
        {
            name: LocalStorageKeys.Theme,
            storage: createJSONStorage(() => localStorage),
            partialize: (s) => ({ theme: s.theme }),
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
export const darkModeSelector = (s: ThemeState) => resolveTheme(s.theme, s.systemDark);

// --- Hook ---

/**
 * Syncs the persisted theme preference to the DOM.
 * - Re-applies when the OS preference changes (relevant for 'system').
 * - Syncs theme changes made in other tabs via the storage event.
 * Mount once at the app root.
 */
export function useTheme(): void {
    const theme = useThemeStore((s) => s.theme);
    const systemDark = useThemeStore((s) => s.systemDark);
    const setTheme = useThemeStore((s) => s.setTheme);
    const setSystemDark = useThemeStore((s) => s.setSystemDark);

    useEffect(() => {
        applyTheme(theme, systemDark);
    }, [theme, systemDark]);

    useEffect(() => {
        const mq = systemDarkQuery();
        const handler = () => setSystemDark(mq.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [setSystemDark]);

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
