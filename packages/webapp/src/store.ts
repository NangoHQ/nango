import { create } from 'zustand';

import { PROD_ENVIRONMENT_NAME } from './constants';
import storage, { LocalStorageKeys } from './utils/local-storage';

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
    env: storage.getItem(LocalStorageKeys.LastEnvironment) || 'dev',
    envs: [{ name: 'dev' }, { name: PROD_ENVIRONMENT_NAME }],
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
