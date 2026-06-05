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

    /**
     * When true, the breakdown panels render synthesized fixture data (real
     * integration/connection names from the env, made-up distribution) instead of
     * calling the breakdown API — for previewing the dense-data UI before the
     * backend serves real breakdowns. Requires `usageBreakdown` to be on.
     */
    usageBreakdownFixtures: boolean;

    /**
     * Dev-only: lowers the breakdown availability bound from June 2026 to May 2026
     * so breakdowns can be exercised on May (ClickHouse data is only partial then,
     * so this is for development, not customers). Requires `usageBreakdown` to be on.
     */
    usageBreakdownAllowMay: boolean;

    setFlag: <K extends keyof Omit<FeatureFlagsState, 'setFlag'>>(key: K, value: boolean) => void;
}

export const useFeatureFlagsStore = create<FeatureFlagsState>()(
    persist(
        (set) => ({
            // Off by default — enable via the dev panel (Ctrl+Shift+D)
            themeSwitcher: false,
            usageBreakdown: false,
            usageBreakdownFixtures: false,
            usageBreakdownAllowMay: false,

            setFlag: (key, value) => set({ [key]: value })
        }),
        {
            name: LocalStorageKeys.FeatureFlags,
            storage: createJSONStorage(() => localStorage)
        }
    )
);
