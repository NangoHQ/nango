import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LocalStorageKeys } from '../utils/local-storage';

export interface FeatureFlagsState {
    darkMode: boolean;
    setDarkMode: (value: boolean) => void;
    toggleDarkMode: () => void;
}

export const useFeatureFlagsStore = create<FeatureFlagsState>()(
    persist(
        (set, get) => ({
            // Default to dark mode to match the existing app default
            darkMode: true,

            setDarkMode: (value) => set({ darkMode: value }),
            toggleDarkMode: () => set({ darkMode: !get().darkMode })
        }),
        {
            name: LocalStorageKeys.FeatureFlags,
            storage: createJSONStorage(() => localStorage)
        }
    )
);
