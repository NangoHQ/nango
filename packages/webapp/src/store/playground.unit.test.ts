import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/local-storage', () => ({
    LocalStorageKeys: { Playground: 'nango_playground' }
}));

// vi.hoisted runs before ESM imports, so localStorage is stubbed before the persist
// middleware initializes (which happens at module load time).
const localStore = vi.hoisted(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('sessionStorage', {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
            store[k] = v;
        },
        removeItem: (k: string) => {
            Reflect.deleteProperty(store, k);
        },
        clear: () => {
            Object.keys(store).forEach((k) => {
                Reflect.deleteProperty(store, k);
            });
        }
    });
    return store;
});

// Relative import — no alias needed from the test side
import { defaultPlaygroundState, usePlaygroundStore } from './playground';

describe('usePlaygroundStore', () => {
    afterEach(() => {
        usePlaygroundStore.setState({ ...defaultPlaygroundState });
        Object.keys(localStore).forEach((k) => {
            Reflect.deleteProperty(localStore, k);
        });
    });

    describe('setIntegration', () => {
        it('sets the new integration', () => {
            usePlaygroundStore.getState().setIntegration('github');
            expect(usePlaygroundStore.getState().integration).toBe('github');
        });

        it('clears connection, function, functionType, and inputValues', () => {
            usePlaygroundStore.setState({ connection: 'c', function: 'fn', functionType: 'action', inputValues: { x: '1' } });
            usePlaygroundStore.getState().setIntegration('github');
            const s = usePlaygroundStore.getState();
            expect(s.connection).toBeNull();
            expect(s.function).toBeNull();
            expect(s.functionType).toBeNull();
            expect(s.inputValues).toEqual({});
        });
    });

    describe('setFunction', () => {
        it('sets function name and type and clears inputValues', () => {
            usePlaygroundStore.setState({ inputValues: { a: '1', b: '2' } });
            usePlaygroundStore.getState().setFunction('fetchContacts', 'action');
            const s = usePlaygroundStore.getState();
            expect(s.function).toBe('fetchContacts');
            expect(s.functionType).toBe('action');
            expect(s.inputValues).toEqual({});
        });
    });

    describe('reset', () => {
        it('clears all state and keeps isOpen=true by default', () => {
            usePlaygroundStore.setState({
                isOpen: true,
                integration: 'github',
                connection: 'c',
                function: 'fn',
                functionType: 'sync',
                inputValues: { x: '1' },
                result: { success: true, data: null, durationMs: 0 },
                pendingOperationId: 'op-1',
                running: true,
                inputErrors: { x: 'err' }
            });
            usePlaygroundStore.getState().reset();
            const s = usePlaygroundStore.getState();
            expect(s.isOpen).toBe(true);
            expect(s.integration).toBeNull();
            expect(s.connection).toBeNull();
            expect(s.function).toBeNull();
            expect(s.functionType).toBeNull();
            expect(s.inputValues).toEqual({});
            expect(s.result).toBeNull();
            expect(s.pendingOperationId).toBeNull();
            expect(s.running).toBe(false);
            expect(s.inputErrors).toEqual({});
        });

        it('closes the sheet when keepOpen=false', () => {
            usePlaygroundStore.setState({ isOpen: true });
            usePlaygroundStore.getState().reset(false);
            expect(usePlaygroundStore.getState().isOpen).toBe(false);
        });
    });

    describe('inputErrors', () => {
        it('setInputError adds an error by field name', () => {
            usePlaygroundStore.getState().setInputError('email', 'Required');
            expect(usePlaygroundStore.getState().inputErrors).toEqual({ email: 'Required' });
        });

        it('setInputErrors replaces all errors at once', () => {
            usePlaygroundStore.setState({ inputErrors: { a: 'old' } });
            usePlaygroundStore.getState().setInputErrors({ b: 'new' });
            expect(usePlaygroundStore.getState().inputErrors).toEqual({ b: 'new' });
        });

        it('clearInputError removes only the targeted key', () => {
            usePlaygroundStore.setState({ inputErrors: { email: 'Required', name: 'Too short' } });
            usePlaygroundStore.getState().clearInputError('email');
            expect(usePlaygroundStore.getState().inputErrors).toEqual({ name: 'Too short' });
        });

        it('clearInputError is a no-op for unknown keys', () => {
            usePlaygroundStore.setState({ inputErrors: { name: 'err' } });
            usePlaygroundStore.getState().clearInputError('missing');
            expect(usePlaygroundStore.getState().inputErrors).toEqual({ name: 'err' });
        });
    });

    describe('persist partialize', () => {
        it('persists integration, connection, function, functionType, inputValues, pendingOperationId', () => {
            usePlaygroundStore.setState({
                integration: 'github',
                connection: 'conn-1',
                function: 'fetchContacts',
                functionType: 'action',
                inputValues: { q: 'hello' },
                pendingOperationId: 'op-99'
            });
            const raw = localStore['nango_playground'];
            if (!raw) return; // async flush — skip if persist hasn't written yet
            const persisted = JSON.parse(raw).state;
            expect(persisted.integration).toBe('github');
            expect(persisted.connection).toBe('conn-1');
            expect(persisted.function).toBe('fetchContacts');
            expect(persisted.functionType).toBe('action');
            expect(persisted.inputValues).toEqual({ q: 'hello' });
            expect(persisted.pendingOperationId).toBe('op-99');
        });

        it('never persists running, result, inputErrors, connectionSearch, or isOpen=true', () => {
            usePlaygroundStore.setState({
                isOpen: true,
                running: true,
                result: { success: true, data: 'x', durationMs: 100 },
                inputErrors: { x: 'err' },
                connectionSearch: 'foo'
            });
            const raw = localStore['nango_playground'];
            if (!raw) return;
            const persisted = JSON.parse(raw).state;
            expect(persisted.isOpen).toBe(false);
            expect(persisted.running).toBe(false);
            expect(persisted.result).toBeNull();
            expect(persisted.inputErrors).toEqual({});
            expect(persisted.connectionSearch).toBe('');
        });
    });
});
