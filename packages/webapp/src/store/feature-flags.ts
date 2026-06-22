import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LocalStorageKeys } from '../utils/local-storage';

/**
 * Local-storage-only feature flags for development use.
 * Only surfaced via DevToolPanel — never shipped to production UI.
 */
export interface FeatureFlagsState {
    /** When true, surfaces per-metric breakdown controls on the billing usage dashboard. */
    usageBreakdown: boolean;

    setFlag: <K extends keyof Omit<FeatureFlagsState, 'setFlag'>>(key: K, value: boolean) => void;
}

export const useFeatureFlagsStore = create<FeatureFlagsState>()(
    persist(
        (set) => ({
            // Off by default — enable via the dev panel (Ctrl+Shift+D)
            usageBreakdown: false,

            setFlag: (key, value) => set({ [key]: value })
        }),
        {
            name: LocalStorageKeys.FeatureFlags,
            storage: createJSONStorage(() => localStorage)
        }
    )
);
