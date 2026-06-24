import { describe, expect, it, vi } from 'vitest';

import { NangoFunctionBase } from './function.js';

import type { ApiPublicConnection, NangoProps } from '@nangohq/types';

function makeProps(overrides: Partial<NangoProps> = {}): NangoProps {
    // Only the fields used by the base constructor are required for these tests.
    return {
        connectionId: 'connection-id',
        environmentId: 1,
        team: { id: 1, name: 'test-team' },
        providerConfigKey: 'provider-config-key',
        activityLogId: 'activity-log-id',
        runnerFlags: {},
        scriptType: 'action',
        isCLI: false,
        ...overrides
    } as unknown as NangoProps;
}

const connection = { connection_id: 'conn-1', provider_config_key: 'provider-config-key' } as unknown as ApiPublicConnection;

function makeFunction(overrides: Partial<NangoProps> = {}) {
    const listConnections = vi.fn().mockResolvedValue({ connections: [connection] });

    class TestFunction extends NangoFunctionBase {
        nango = { listConnections } as any;

        proxy(): Promise<any> {
            throw new Error('not implemented');
        }
        log(): any {
            return;
        }
        triggerSync(): Promise<any> {
            throw new Error('not implemented');
        }
        startSync(): Promise<any> {
            throw new Error('not implemented');
        }
        uncontrolledFetch(): Promise<Response> {
            throw new Error('not implemented');
        }
        tryAcquireLock(): Promise<boolean> {
            return Promise.resolve(false);
        }
        releaseLock(): Promise<boolean> {
            return Promise.resolve(false);
        }
        releaseAllLocks(): Promise<void> {
            return Promise.resolve();
        }
        getCheckpoint(): Promise<any> {
            return Promise.resolve(null);
        }
        saveCheckpoint(): Promise<void> {
            return Promise.resolve();
        }
        clearCheckpoint(): Promise<void> {
            return Promise.resolve();
        }
        batchSave(): Promise<boolean> {
            return Promise.resolve(true);
        }
        batchDelete(): Promise<any> {
            return Promise.resolve();
        }
        batchUpdate(): Promise<any> {
            return Promise.resolve();
        }
        getRecordsByIds(): Promise<any> {
            return Promise.resolve(new Map());
        }
        async *listRecords(): AsyncGenerator<any> {
            // no records in tests
        }
        deleteRecordsFromPreviousExecutions(): Promise<any> {
            return Promise.resolve({ deletedKeys: [] });
        }
        trackDeletesStart(): Promise<void> {
            return Promise.resolve();
        }
        trackDeletesEnd(): Promise<any> {
            return Promise.resolve({ deletedKeys: [] });
        }
        setMergingStrategy(): Promise<void> {
            return Promise.resolve();
        }
    }

    return { fn: new TestFunction(makeProps(overrides)), listConnections };
}

describe('searchConnections', () => {
    it('throws when called from a connection-scoped run', async () => {
        const { fn, listConnections } = makeFunction({ connectionId: 'connection-id' });

        await expect(fn.searchConnections({ tags: { portalId: '12345' } })).rejects.toThrow(
            'searchConnections() can only be used in connection-less functions'
        );
        expect(listConnections).not.toHaveBeenCalled();
    });

    it('searches the integration connections for connection-less runs', async () => {
        const { fn, listConnections } = makeFunction({ connectionId: '' });

        const connections = await fn.searchConnections({ tags: { portalId: '12345' } });

        expect(listConnections).toHaveBeenCalledWith({ tags: { portalId: '12345' }, integrationId: 'provider-config-key' });
        expect(connections).toEqual([connection]);
    });
});
