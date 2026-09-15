import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';

import { APIError, isUnauthenticatedEndpoint } from '../utils/api';
import { PROD_ENVIRONMENT_NAME } from '../utils/environments';
import storage, { LocalStorageKeys } from '../utils/local-storage';
import { isPublicAuthPath } from '../utils/routes';
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

let signingOut = false;

async function handleQueryError(error: unknown) {
    if (signingOut || !(error instanceof APIError) || error.res.status !== 401) {
        return;
    }
    if (isUnauthenticatedEndpoint(error.res.url) || isPublicAuthPath(window.location.pathname)) {
        return;
    }

    // Every query mounted on the page fails at once; without this they each start their own signout.
    signingOut = true;

    // Imported here because utils/user reads the queryClient this module exports.
    const { signout } = await import('../utils/user');
    await signout({ expired: true });
}

export const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => void handleQueryError(error) }),
    mutationCache: new MutationCache({ onError: (error) => void handleQueryError(error) }),
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
