import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LocalStorageKeys } from '../utils/local-storage';

export interface ThemeState {
    darkMode: boolean;
    toggleDarkMode: () => void;
    setDarkMode: (value: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            // Default to dark mode to match the existing app default
            darkMode: true,

            toggleDarkMode: () => set({ darkMode: !get().darkMode }),
            setDarkMode: (value) => set({ darkMode: value })
        }),
        {
            name: LocalStorageKeys.Theme,
            storage: createJSONStorage(() => localStorage)
        }
    )
);
