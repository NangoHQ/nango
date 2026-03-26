import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LocalStorageKeys } from '@/utils/local-storage';

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

interface PlaygroundStore extends PlaygroundState {
    setOpen: (value: boolean) => void;
    setIntegration: (value: string | null) => void;
    setConnection: (value: string | null) => void;
    setFunction: (name: string | null, type: PlaygroundFunctionType) => void;
    setInputValues: (values: Record<string, string>) => void;
    setInputValue: (name: string, value: string) => void;
    setResult: (result: PlaygroundResult | null) => void;
    setPendingOperationId: (operationId: string | null) => void;
    setRunning: (running: boolean) => void;
    setInputErrors: (errors: Record<string, string>) => void;
    setInputError: (name: string, message: string) => void;
    clearInputError: (name: string) => void;
    setConnectionSearch: (search: string) => void;
    reset: (keepOpen?: boolean) => void;
    setState: (value: PlaygroundState) => void;
}

export const defaultPlaygroundState: PlaygroundState = {
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

export const usePlaygroundStore = create<PlaygroundStore>()(
    persist(
        (set) => ({
            ...defaultPlaygroundState,

            setOpen: (isOpen) => set({ isOpen }),

            setIntegration: (integration) => set({ integration, connection: null, function: null, functionType: null, inputValues: {} }),

            setConnection: (connection) => set({ connection }),

            setFunction: (name, type) => set({ function: name, functionType: type, inputValues: {} }),

            setInputValues: (inputValues) => set({ inputValues }),

            setInputValue: (name, value) => set((s) => ({ inputValues: { ...s.inputValues, [name]: value } })),

            setResult: (result) => set({ result }),

            setPendingOperationId: (pendingOperationId) => set({ pendingOperationId }),

            setRunning: (running) => set({ running }),

            setInputErrors: (inputErrors) => set({ inputErrors }),

            setInputError: (name, message) => set((s) => ({ inputErrors: { ...s.inputErrors, [name]: message } })),

            clearInputError: (name) =>
                set((s) => {
                    const { [name]: _removed, ...rest } = s.inputErrors;
                    return { inputErrors: rest };
                }),

            setConnectionSearch: (connectionSearch) => set({ connectionSearch }),

            reset: (keepOpen = true) => set((s) => ({ ...defaultPlaygroundState, isOpen: keepOpen ? s.isOpen : false })),

            setState: (value) => set(value)
        }),
        {
            name: LocalStorageKeys.Playground,
            storage: createJSONStorage(() => sessionStorage),
            partialize: (s) => ({
                isOpen: false,
                integration: s.integration,
                connection: s.connection,
                function: s.function,
                functionType: s.functionType,
                inputValues: s.inputValues,
                result: null,
                pendingOperationId: s.pendingOperationId,
                running: false,
                inputErrors: {},
                connectionSearch: ''
            })
        }
    )
);
