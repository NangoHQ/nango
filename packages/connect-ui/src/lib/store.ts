import { create } from 'zustand';

import type Nango from '@nangohq/frontend';
import type { ConnectSessionOutput, GetPublicIntegration, GetPublicProvider } from '@nangohq/types';

interface State {
    sessionToken: string | null;
    provider: GetPublicProvider['Success']['data'] | null;
    integration: GetPublicIntegration['Success']['data'] | null;
    isDirty: boolean;
    isSingleIntegration: boolean;
    session: ConnectSessionOutput | null;
    nango: Nango | null;
    apiURL: string;
    setApiURL: (value: string) => void;
    setSessionToken: (value: string) => void;
    setSession: (value: ConnectSessionOutput) => void;
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
    apiURL: 'https://api.nango.dev',
    setApiURL: (value) => set({ apiURL: value }),
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
