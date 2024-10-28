import { create } from 'zustand';

import type Nango from '@nangohq/frontend';
import type { ConnectSessionPayload, GetPublicIntegration, GetPublicProvider } from '@nangohq/types';

interface State {
    sessionToken: string | null;
    provider: GetPublicProvider['Success']['data'] | null;
    integration: GetPublicIntegration['Success']['data'] | null;
    isDirty: boolean;
    isSingleIntegration: boolean;
    session: ConnectSessionPayload | null;
    nango: Nango | null;
    setSessionToken: (value: string) => void;
    setSession: (value: ConnectSessionPayload) => void;
    setNango: (value: Nango) => void;
    setIsDirty: (value: boolean) => void;
    setIsSingleIntegration: (value: boolean) => void;
    set: (provider: GetPublicProvider['Success']['data'], integration: GetPublicIntegration['Success']['data']) => void;
    reset: () => void;
}

export const useGlobal = create<State>((set) => ({
    sessionToken: null,
    provider: null,
    integration: null,
    isDirty: false,
    isSingleIntegration: false,
    session: null,
    nango: null,
    setSessionToken: (value) => set({ sessionToken: value }),
    setSession: (value) => set({ session: value }),
    setNango: (value) => set({ nango: value }),
    setIsDirty: (value) => set({ isDirty: value }),
    setIsSingleIntegration: (value) => set({ isSingleIntegration: value }),
    set: (provider, integration) => {
        set({ provider, integration });
    },
    reset: () => {
        set({ provider: null, integration: null });
    }
}));
