import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';

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

// Reads the location before awaiting anything: PrivateRoute redirects to /signin on the same 401.
function handleQueryError(error: unknown) {
    const { pathname, search, hash } = window.location;
    if (isPublicAuthPath(pathname)) {
        return;
    }

    void signoutIfExpired(error, { pathname, search, hash });
}

async function signoutIfExpired(error: unknown, from: { pathname: string; search: string; hash: string }) {
    // A static import would break this module's node-environment unit test: utils/api reads `window` as it loads.
    const { APIError, isUnauthenticatedEndpoint } = await import('../utils/api');
    if (!(error instanceof APIError) || error.res.status !== 401 || isUnauthenticatedEndpoint(error.res.url)) {
        return;
    }

    // A static import would be circular: utils/user reads the queryClient declared below.
    const { signout } = await import('../utils/user');
    await signout({ expired: true, from });
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
