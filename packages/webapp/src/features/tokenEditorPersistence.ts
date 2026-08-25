export type ThemeKey = 'light' | 'dark';

export interface BiThemeOverrides {
    light: Record<string, string>;
    dark: Record<string, string>;
}

export const EMPTY_BI: BiThemeOverrides = { light: {}, dark: {} };

export const STORAGE_KEY = 'nango-dev-token-overrides';
export const LINKED_STORAGE_KEY = 'nango-dev-token-linked';
export const REF_STORAGE_KEY = 'nango-dev-token-ref-overrides';

export function loadOverrides(): BiThemeOverrides {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
        // Migrate old flat format (pre per-theme)
        if (typeof raw === 'object' && ('light' in raw || 'dark' in raw)) return raw as BiThemeOverrides;
        return { light: raw as Record<string, string>, dark: {} };
    } catch {
        return { ...EMPTY_BI };
    }
}

export function saveOverrides(o: BiThemeOverrides) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
    } catch {
        /* ignore storage errors */
    }
}

export function loadLinked(): Set<string> {
    try {
        const raw = JSON.parse(localStorage.getItem(LINKED_STORAGE_KEY) ?? '[]');
        return Array.isArray(raw) ? new Set(raw as string[]) : new Set();
    } catch {
        return new Set();
    }
}

export function saveLinked(linked: Set<string>) {
    try {
        localStorage.setItem(LINKED_STORAGE_KEY, JSON.stringify([...linked]));
    } catch {
        /* ignore storage errors */
    }
}

export function loadRefOverrides(): BiThemeOverrides {
    try {
        const raw = JSON.parse(localStorage.getItem(REF_STORAGE_KEY) ?? '{}');
        if (typeof raw === 'object' && ('light' in raw || 'dark' in raw)) return raw as BiThemeOverrides;
        return { ...EMPTY_BI };
    } catch {
        return { ...EMPTY_BI };
    }
}

export function saveRefOverrides(o: BiThemeOverrides) {
    try {
        localStorage.setItem(REF_STORAGE_KEY, JSON.stringify(o));
    } catch {
        /* ignore storage errors */
    }
}

/** Apply persisted color overrides for one theme, clearing the other theme's vars first. */
export function syncPersistedOverridesToTheme(theme: ThemeKey) {
    const saved = loadOverrides();
    const other: ThemeKey = theme === 'dark' ? 'light' : 'dark';
    for (const k of Object.keys(saved[other])) {
        document.documentElement.style.removeProperty(k);
    }
    for (const [k, v] of Object.entries(saved[theme])) {
        document.documentElement.style.setProperty(k, v);
    }
}
