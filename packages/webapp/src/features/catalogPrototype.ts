import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LocalStorageKeys } from '@/utils/local-storage';

interface CatalogPrototypeState {
    readableFunctionNames: boolean;
    setReadableFunctionNames: (readableFunctionNames: boolean) => void;
}

export const useCatalogPrototypeStore = create<CatalogPrototypeState>()(
    persist(
        (set) => ({
            readableFunctionNames: true,
            setReadableFunctionNames: (readableFunctionNames) => set({ readableFunctionNames })
        }),
        {
            name: LocalStorageKeys.DevCatalogPrototype,
            storage: createJSONStorage(() => localStorage)
        }
    )
);
