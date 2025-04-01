import { create } from 'zustand';

interface Env {
    name: string;
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
}

export const useStore = create<State>((set, get) => ({
    env: 'dev',
    envs: [],
    baseUrl: 'https://api.nango.dev',
    showGettingStarted: true,
    debugMode: false,

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
    }
}));
