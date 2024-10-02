import { create } from 'zustand';

import type { ConnectSessionPayload, GetPublicIntegration, GetPublicProvider } from '@nangohq/types';

interface State {
    sessionToken: string | null;
    provider: GetPublicProvider['Success']['data'] | null;
    integration: GetPublicIntegration['Success']['data'] | null;
    isDirty: boolean;
    session: ConnectSessionPayload | null;
    setSessionToken: (value: string) => void;
    setSession: (value: ConnectSessionPayload) => void;
    setIsDirty: (value: boolean) => void;
    set: (provider: GetPublicProvider['Success']['data'], integration: GetPublicIntegration['Success']['data']) => void;
    reset: () => void;
}

export const useGlobal = create<State>((set) => ({
    sessionToken: null,
    provider: null,
    integration: null,
    isDirty: false,
    session: null,
    setSessionToken: (value) => set({ sessionToken: value }),
    setSession: (value) => set({ session: value }),
    setIsDirty: (value) => set({ isDirty: value }),
    set: (provider, integration) => {
        set({ provider, integration });
    },
    reset: () => {
        set({ provider: null, integration: null });
    }
}));
