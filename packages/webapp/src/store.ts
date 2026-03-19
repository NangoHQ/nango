import { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { PROD_ENVIRONMENT_NAME } from './constants';
import storage, { LocalStorageKeys } from './utils/local-storage';

interface Env {
    name: string;
}

export type PlaygroundFunctionType = 'action' | 'sync' | null;

export interface PlaygroundResult {
    success: boolean;
    data: unknown;
    durationMs: number;
    operationId?: string;
    state?: string;
}

export interface PlaygroundState {
    isOpen: boolean;
    integration: string | null;
    connection: string | null;
    function: string | null;
    functionType: PlaygroundFunctionType;
    inputValues: Record<string, string>;
    result: PlaygroundResult | null;
    // Persisted — used to re-attach to an in-flight operation after navigation/refresh
    pendingOperationId: string | null;
    // Transient — not persisted to localStorage
    running: boolean;
    inputErrors: Record<string, string>;
    connectionSearch: string;
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
    setPlaygroundResult: (result: PlaygroundResult | null) => void;
    setPlaygroundPendingOperationId: (operationId: string | null) => void;
    setPlaygroundRunning: (running: boolean) => void;
    setPlaygroundInputErrors: (errors: Record<string, string>) => void;
    setPlaygroundInputError: (name: string, message: string) => void;
    clearPlaygroundInputError: (name: string) => void;
    setPlaygroundConnectionSearch: (search: string) => void;
    resetPlayground: () => void;
    setPlaygroundState: (value: PlaygroundState) => void;
}

const defaultPlayground: PlaygroundState = {
    isOpen: false,
    integration: null,
    connection: null,
    function: null,
    functionType: null,
    inputValues: {},
    result: null,
    pendingOperationId: null,
    running: false,
    inputErrors: {},
    connectionSearch: ''
};

export const useStore = create<State>()(
    persist(
        (set, get) => ({
            env: storage.getItem(LocalStorageKeys.LastEnvironment) || 'dev',
            envs: [{ name: 'dev' }, { name: PROD_ENVIRONMENT_NAME }],
            baseUrl: 'https://api.nango.dev',
            showGettingStarted: true,
            debugMode: false,
            playground: defaultPlayground,

            setEnv: (value) => {
                set((s) => ({
                    env: value,
                    // Clear playground state when switching environments to avoid stale results
                    playground: s.env !== value ? { ...defaultPlayground, isOpen: s.playground.isOpen } : s.playground
                }));
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

            setPlaygroundResult: (result) => {
                set((s) => ({ playground: { ...s.playground, result } }));
            },

            setPlaygroundPendingOperationId: (pendingOperationId) => {
                set((s) => ({ playground: { ...s.playground, pendingOperationId } }));
            },

            setPlaygroundRunning: (running) => {
                set((s) => ({ playground: { ...s.playground, running } }));
            },

            setPlaygroundInputErrors: (inputErrors) => {
                set((s) => ({ playground: { ...s.playground, inputErrors } }));
            },

            setPlaygroundInputError: (name, message) => {
                set((s) => ({ playground: { ...s.playground, inputErrors: { ...s.playground.inputErrors, [name]: message } } }));
            },

            clearPlaygroundInputError: (name) => {
                set((s) => {
                    const { [name]: _ignored, ...rest } = s.playground.inputErrors;
                    return { playground: { ...s.playground, inputErrors: rest } };
                });
            },

            setPlaygroundConnectionSearch: (connectionSearch) => {
                set((s) => ({ playground: { ...s.playground, connectionSearch } }));
            },

            resetPlayground: () => {
                set((s) => ({ playground: { ...defaultPlayground, isOpen: s.playground.isOpen } }));
            },

            setPlaygroundState: (value) => {
                set({ playground: value });
            }
        }),
        {
            name: LocalStorageKeys.Playground,
            // Persist selection and pendingOperationId for re-attach; exclude result
            // (can be large) and all transient UI state.
            partialize: (s) => ({
                playground: {
                    isOpen: false,
                    integration: s.playground.integration,
                    connection: s.playground.connection,
                    function: s.playground.function,
                    functionType: s.playground.functionType,
                    inputValues: s.playground.inputValues,
                    result: null,
                    pendingOperationId: s.playground.pendingOperationId,
                    running: false,
                    inputErrors: {},
                    connectionSearch: ''
                }
            })
        }
    )
);

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
