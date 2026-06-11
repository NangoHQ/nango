import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LocalStorageKeys } from '../utils/local-storage';

/**
 * Local-storage-only feature flags for development use.
 * Only surfaced via DevToolPanel — never shipped to production UI.
 *
 * Each flag here controls whether a particular feature is visible/active
 * in the app UI. The flag itself is NOT the feature state — e.g. `themeSwitcher`
 * controls whether the dark/light toggle button appears in the navbar;
 * the actual theme state lives in `useThemeStore`.
 */
export interface FeatureFlagsState {
    /** When true, shows the dark/light mode toggle button in the app header. */
    themeSwitcher: boolean;

    /** When true, surfaces per-metric breakdown controls on the billing usage dashboard. */
    usageBreakdown: boolean;

    setFlag: <K extends keyof Omit<FeatureFlagsState, 'setFlag'>>(key: K, value: boolean) => void;
}

export const useFeatureFlagsStore = create<FeatureFlagsState>()(
    persist(
        (set) => ({
            // Off by default — enable via the dev panel (Ctrl+Shift+D)
            themeSwitcher: false,
            usageBreakdown: false,

            setFlag: (key, value) => set({ [key]: value })
        }),
        {
            name: LocalStorageKeys.FeatureFlags,
            storage: createJSONStorage(() => localStorage)
        }
    )
);
