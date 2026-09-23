import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';

import { APIError, isNoSessionError } from '../utils/api';
import { PROD_ENVIRONMENT_NAME } from '../utils/environments';
import storage, { LocalStorageKeys } from '../utils/local-storage';
// Keep this static. signout() takes its latch on the first 401, before PrivateRoute's redirect sends a second one from /signin.
import { signout } from '../utils/user';
import { resetPlayground } from './playground';

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

const initialEnv: unknown = storage.getItem(LocalStorageKeys.LastEnvironment);

export const useStore = create<State>()((set, get) => ({
    env: typeof initialEnv === 'string' && initialEnv ? initialEnv : 'dev',
    envs: [{ name: 'dev' }, { name: PROD_ENVIRONMENT_NAME }],
    baseUrl: 'https://api.nango.dev',
    showGettingStarted: true,
    debugMode: false,

    setEnv: (value) => {
        if (get().env !== value) {
            resetPlayground();
        }
        set({ env: value });
    },

    setEnvs: (envs) => set({ envs }),

    setBaseUrl: (value) => set({ baseUrl: value }),

    setShowGettingStarted: (value) => set({ showGettingStarted: value }),

    setDebugMode: (value) => set({ debugMode: value })
}));

function handleQueryError(error: unknown) {
    if (error instanceof APIError && isNoSessionError(error.res.status, error.json)) {
        void signout({ expired: true });
    }
}

export const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => handleQueryError(error) }),
    mutationCache: new MutationCache({ onError: (error) => handleQueryError(error) }),
    defaultOptions: {
        queries: {
            refetchInterval: 0,
            refetchOnWindowFocus: false,
            refetchOnMount: true,
            staleTime: 30 * 1000,
            retry: 0,
            retryDelay: (attemptIndex) => Math.min(2000 * 2 ** attemptIndex, 30000)
        }
    }
});
