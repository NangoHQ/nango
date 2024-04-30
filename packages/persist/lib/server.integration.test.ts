import { expect, describe, it, beforeAll, afterAll } from 'vitest';
import { server } from './server.js';
import fetch from 'node-fetch';
import type { AuthCredentials, Connection, Sync, Job as SyncJob, Environment } from '@nangohq/shared';
import {
    multipleMigrations,
    createActivityLog,
    environmentService,
    connectionService,
    createSync,
    createSyncJob,
    SyncType,
    SyncStatus,
    db
} from '@nangohq/shared';
import { logContextGetter } from '@nangohq/logs';

describe('Persist API', () => {
    const port = 3096;
    const serverUrl = `http://localhost:${port}`;
    let seed: {
        env: Environment;
        activityLogId: number;
        connection: Connection;
        sync: Sync;
        syncJob: SyncJob;
    };

    beforeAll(async () => {
        await multipleMigrations();
        seed = await initDb();
        server.listen(port);
    });

    afterAll(async () => {
        await clearDb();
    });

    it('should server /health', async () => {
        const response = await fetch(`${serverUrl}/health`);
        expect(response.status).toEqual(200);
        expect(await response.json()).toEqual({ status: 'ok' });
    });

    it('should log', async () => {
        const response = await fetch(`${serverUrl}/environment/${seed.env.id}/log`, {
            method: 'POST',
            body: JSON.stringify({ activityLogId: seed.activityLogId, level: 'info', msg: 'Hello, world!' }),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        expect(response.status).toEqual(201);
    });

    it('should refuse huge log', async () => {
        const msg: number[] = [];

        for (let index = 0; index < 150_000; index++) {
            msg.push(index);
        }
        const response = await fetch(`${serverUrl}/environment/${seed.env.id}/log`, {
            method: 'POST',
            body: JSON.stringify({ activityLogId: seed.activityLogId, level: 'info', msg: msg.join(',') }),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        expect(response.status).toEqual(400);
        expect(await response.json()).toStrictEqual({ error: 'Entity too large' });
    });

    describe('save records', () => {
        it('should error if no records', async () => {
            const response = await fetch(
                `${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/sync/${seed.sync.id}/job/${seed.syncJob.id}/records`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        model: 'MyModel',
                        records: [],
                        providerConfigKey: seed.connection.provider_config_key,
                        connectionId: seed.connection.connection_id,
                        lastSyncDate: new Date(),
                        trackDeletes: false,
                        softDelete: true,
                        activityLogId: seed.activityLogId
                    }),
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            expect(response.status).toEqual(400);
            const respBody = (await response.json()) as any[];
            expect(respBody).toMatchObject([
                {
                    type: 'Body',
                    errors: {
                        issues: [
                            {
                                code: 'too_small',
                                minimum: 1,
                                type: 'array',
                                message: 'Array must contain at least 1 element(s)',
                                path: ['records']
                            }
                        ],
                        name: 'ZodError'
                    }
                }
            ]);
        });

        it('should save records', async () => {
            const model = 'MyModel';
            const records = [
                { id: 1, name: 'r1' },
                { id: 2, name: 'r2' }
            ];
            const response = await fetch(
                `${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/sync/${seed.sync.id}/job/${seed.syncJob.id}/records`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        model,
                        records: records,
                        providerConfigKey: seed.connection.provider_config_key,
                        connectionId: seed.connection.connection_id,
                        activityLogId: seed.activityLogId,
                        lastSyncDate: new Date(),
                        trackDeletes: false
                    }),
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            expect(response.status).toEqual(201);
        });
    });

    it('should delete records ', async () => {
        const model = 'MyModel';
        const records = [
            { id: 1, name: 'r1' },
            { id: 2, name: 'r2' }
        ];
        const response = await fetch(
            `${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/sync/${seed.sync.id}/job/${seed.syncJob.id}/records`,
            {
                method: 'DELETE',
                body: JSON.stringify({
                    model,
                    records: records,
                    providerConfigKey: seed.connection.provider_config_key,
                    connectionId: seed.connection.connection_id,
                    activityLogId: seed.activityLogId,
                    lastSyncDate: new Date(),
                    trackDeletes: false
                }),
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        expect(response.status).toEqual(201);
    });

    it('should update records ', async () => {
        const model = 'MyModel';
        const records = [
            { id: 1, name: 'new1' },
            { id: 2, name: 'new2' }
        ];
        const response = await fetch(
            `${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/sync/${seed.sync.id}/job/${seed.syncJob.id}/records`,
            {
                method: 'PUT',
                body: JSON.stringify({
                    model,
                    records: records,
                    providerConfigKey: seed.connection.provider_config_key,
                    connectionId: seed.connection.connection_id,
                    activityLogId: seed.activityLogId,
                    lastSyncDate: new Date(),
                    trackDeletes: false,
                    softDelete: true
                }),
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        expect(response.status).toEqual(201);
    });
});

const initDb = async () => {
    const env = await environmentService.createEnvironment(0, 'testEnv');
    if (!env) throw new Error('Environment not created');
    const activityLogId = await createActivityLog({
        environment_id: env.id,
        level: 'info',
        action: 'sync',
        success: null,
        timestamp: Date.now(),
        start: Date.now(),
        connection_id: null,
        provider_config_key: null
    });
    if (!activityLogId) {
        throw new Error('Activity log not created');
    }

    await logContextGetter.create(
        { id: String(activityLogId), operation: { type: 'sync', action: 'run' }, message: 'Sync' },
        { account: { id: env.account_id }, environment: { id: env.id } }
    );

    const connectionRes = await connectionService.upsertConnection(`conn-test`, `provider-test`, 'google', {} as AuthCredentials, {}, env.id, 0);
    const connectionId = connectionRes[0]?.id;
    if (!connectionId) throw new Error('Connection not created');

    const connection = (await connectionService.getConnectionById(connectionId)) as Connection;
    if (!connection) throw new Error('Connection not found');

    const sync = await createSync(connectionId, 'sync-test');
    if (!sync?.id) throw new Error('Sync not created');

    const syncJob = (await createSyncJob(sync.id, SyncType.INITIAL, SyncStatus.RUNNING, `job-test`, connection)) as SyncJob;
    if (!syncJob) throw new Error('Sync job not created');

    return {
        env,
        activityLogId,
        connection,
        sync,
        syncJob
    };
};

const clearDb = async () => {
    await db.knex.raw(`DROP SCHEMA nango CASCADE`);
};
