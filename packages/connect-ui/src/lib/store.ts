import { create } from 'zustand';

import type { GetPublicIntegration, GetPublicProvider } from '@nangohq/types';

interface State {
    provider: GetPublicProvider['Success']['data'] | null;
    integration: GetPublicIntegration['Success']['data'] | null;
    isDirty: boolean;
    setIsDirty: (value: boolean) => void;
    set: (provider: GetPublicProvider['Success']['data'], integration: GetPublicIntegration['Success']['data']) => void;
    reset: () => void;
}

export const useGlobal = create<State>((set) => ({
    provider: null,
    integration: null,
    isDirty: false,
    setIsDirty: (value) => set({ isDirty: value }),
    set: (provider, integration) => {
        set({ provider, integration });
    },
    reset: () => {
        set({ provider: null, integration: null });
    }
}));
