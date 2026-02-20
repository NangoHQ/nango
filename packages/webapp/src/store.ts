import { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';

import { PROD_ENVIRONMENT_NAME } from './constants';
import storage, { LocalStorageKeys } from './utils/local-storage';

interface Env {
    name: string;
}

export type PlaygroundFunctionType = 'action' | 'sync' | null;

export interface PlaygroundState {
    isOpen: boolean;
    integration: string | null;
    connection: string | null;
    function: string | null;
    functionType: PlaygroundFunctionType;
    inputValues: Record<string, string>;
}

interface State {
    env: string;
    envs: Env[];
    baseUrl: string;
    showGettingStarted: boolean;
    debugMode: boolean;
    setEnv: (value: string) => void;
    setEnvs: (envs: Env[]) => void;
    setBaseUrl: (value: string) => void;
    setShowGettingStarted: (value: boolean) => void;
    setDebugMode: (value: boolean) => void;
    playground: PlaygroundState;
    setPlaygroundOpen: (value: boolean) => void;
    setPlaygroundIntegration: (value: string | null) => void;
    setPlaygroundConnection: (value: string | null) => void;
    setPlaygroundFunction: (name: string | null, type: PlaygroundFunctionType) => void;
    setPlaygroundInputValues: (values: Record<string, string>) => void;
    setPlaygroundInputValue: (name: string, value: string) => void;
    setPlaygroundState: (value: PlaygroundState) => void;
}

export const useStore = create<State>((set, get) => ({
    env: storage.getItem(LocalStorageKeys.LastEnvironment) || 'dev',
    envs: [{ name: 'dev' }, { name: PROD_ENVIRONMENT_NAME }],
    baseUrl: 'https://api.nango.dev',
    showGettingStarted: true,
    debugMode: false,
    playground: {
        isOpen: false,
        integration: null,
        connection: null,
        function: null,
        functionType: null,
        inputValues: {}
    },

    setEnv: (value) => {
        set({ env: value });
    },

    setEnvs: (envs: Env[]) => {
        set({ envs });
    },

    getEnvs: () => {
        return get().envs;
    },

    setBaseUrl: (value) => {
        set({ baseUrl: value });
    },

    setShowGettingStarted: (value) => {
        set({ showGettingStarted: value });
    },

    setDebugMode: (value) => {
        set({ debugMode: value });
    },

    setPlaygroundOpen: (value) => {
        set((s) => ({ playground: { ...s.playground, isOpen: value } }));
    },

    setPlaygroundIntegration: (value) => {
        set((s) => ({
            playground: {
                ...s.playground,
                integration: value,
                connection: null,
                function: null,
                functionType: null,
                inputValues: {}
            }
        }));
    },

    setPlaygroundConnection: (value) => {
        set((s) => ({ playground: { ...s.playground, connection: value } }));
    },

    setPlaygroundFunction: (name, type) => {
        set((s) => ({
            playground: {
                ...s.playground,
                function: name,
                functionType: type,
                inputValues: {}
            }
        }));
    },

    setPlaygroundInputValues: (values) => {
        set((s) => ({ playground: { ...s.playground, inputValues: values } }));
    },

    setPlaygroundInputValue: (name, value) => {
        set((s) => ({ playground: { ...s.playground, inputValues: { ...s.playground.inputValues, [name]: value } } }));
    },

    setPlaygroundState: (value) => {
        set({ playground: value });
    }
}));

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchInterval: 0,
            refetchOnWindowFocus: false,
            refetchOnMount: true,
            staleTime: 30 * 1000,
            retry: 0,
            retryDelay: (attemptIndex) => {
                return Math.min(2000 * 2 ** attemptIndex, 30000);
            }
        }
    }
});
