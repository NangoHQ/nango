import { afterEach, describe, expect, it, vi } from 'vitest';

const storageState = vi.hoisted(() => {
    const localStore: Record<string, string> = {};
    const sessionStore: Record<string, string> = {};

    vi.stubGlobal('localStorage', {
        getItem: (k: string) => localStore[k] ?? null,
        setItem: (k: string, v: string) => {
            localStore[k] = v;
        },
        removeItem: (k: string) => {
            Reflect.deleteProperty(localStore, k);
        },
        clear: () => {
            Object.keys(localStore).forEach((k) => {
                Reflect.deleteProperty(localStore, k);
            });
        }
    });

    vi.stubGlobal('sessionStorage', {
        getItem: (k: string) => sessionStore[k] ?? null,
        setItem: (k: string, v: string) => {
            sessionStore[k] = v;
        },
        removeItem: (k: string) => {
            Reflect.deleteProperty(sessionStore, k);
        },
        clear: () => {
            Object.keys(sessionStore).forEach((k) => {
                Reflect.deleteProperty(sessionStore, k);
            });
        }
    });

    return { localStore, sessionStore };
});

import { useStore } from './store';
import { defaultPlaygroundState, usePlaygroundStore } from './store/playground';

describe('useStore', () => {
    afterEach(() => {
        useStore.setState({ env: 'dev' });
        usePlaygroundStore.setState({ ...defaultPlaygroundState, abortActiveRun: null });
        Object.keys(storageState.localStore).forEach((k) => {
            Reflect.deleteProperty(storageState.localStore, k);
        });
        Object.keys(storageState.sessionStore).forEach((k) => {
            Reflect.deleteProperty(storageState.sessionStore, k);
        });
    });

    describe('setEnv', () => {
        it('aborts and resets the playground when switching environments', () => {
            const abortActiveRun = vi.fn();

            usePlaygroundStore.setState({
                isOpen: true,
                integration: 'github',
                connection: 'conn-1',
                function: 'sync-users',
                functionType: 'sync',
                pendingOperationId: 'op-1',
                running: true,
                abortActiveRun
            });

            useStore.getState().setEnv('prod');

            expect(abortActiveRun).toHaveBeenCalledTimes(1);
            expect(useStore.getState().env).toBe('prod');

            const playgroundState = usePlaygroundStore.getState();
            expect(playgroundState.isOpen).toBe(true);
            expect(playgroundState.integration).toBeNull();
            expect(playgroundState.connection).toBeNull();
            expect(playgroundState.function).toBeNull();
            expect(playgroundState.functionType).toBeNull();
            expect(playgroundState.pendingOperationId).toBeNull();
            expect(playgroundState.running).toBe(false);
        });

        it('does not reset or abort when the environment is unchanged', () => {
            const abortActiveRun = vi.fn();

            usePlaygroundStore.setState({ integration: 'github', abortActiveRun });

            useStore.getState().setEnv('dev');

            expect(abortActiveRun).not.toHaveBeenCalled();
            expect(usePlaygroundStore.getState().integration).toBe('github');
        });
    });
});
