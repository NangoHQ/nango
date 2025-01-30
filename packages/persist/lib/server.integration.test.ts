import { expect, describe, it, beforeAll, afterAll, vi } from 'vitest';
import { server } from './server.js';
import fetch from 'node-fetch';
import type { AuthCredentials, Sync, SyncConfig, Job as SyncJob } from '@nangohq/shared';
import db, { multipleMigrations } from '@nangohq/database';
import {
    environmentService,
    connectionService,
    createSync,
    createSyncJob,
    SyncType,
    SyncStatus,
    accountService,
    configService,
    getProvider
} from '@nangohq/shared';
import { logContextGetter, migrateLogsMapping } from '@nangohq/logs';
import { migrate as migrateRecords, records } from '@nangohq/records';
import type { DBEnvironment, DBTeam } from '@nangohq/types';

const mockSecretKey = 'secret-key';

describe('Persist API', () => {
    const port = 3096;
    const serverUrl = `http://localhost:${port}`;
    let seed: {
        account: DBTeam;
        env: DBEnvironment;
        activityLogId: string;
        connection: Exclude<Awaited<ReturnType<typeof connectionService.getConnectionById>>, null>;
        sync: Sync;
        syncJob: SyncJob;
    };

    beforeAll(async () => {
        await multipleMigrations();
        await migrateRecords();
        await migrateLogsMapping();
        seed = await initDb();
        server.listen(port);

        vi.spyOn(environmentService, 'getAccountAndEnvironmentBySecretKey').mockImplementation((secretKey) => {
            if (secretKey === mockSecretKey) {
                return Promise.resolve({ account: seed.account, environment: seed.env });
            }
            return Promise.resolve(null);
        });
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
                Authorization: `Bearer ${mockSecretKey}`,
                'Content-Type': 'application/json'
            }
        });
        expect(response.status).toEqual(204);
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
                Authorization: `Bearer ${mockSecretKey}`,
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
                        activityLogId: seed.activityLogId
                    }),
                    headers: {
                        Authorization: `Bearer ${mockSecretKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            expect(response.status).toEqual(400);
            const respBody = (await response.json()) as any[];
            expect(respBody).toMatchObject({
                error: {
                    code: 'invalid_request',
                    errors: [
                        {
                            code: 'too_small',
                            message: 'Array must contain at least 1 element(s)',
                            path: ['records']
                        }
                    ]
                }
            });
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
                        activityLogId: seed.activityLogId
                    }),
                    headers: {
                        Authorization: `Bearer ${mockSecretKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            expect(response.status).toEqual(200);
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
                    activityLogId: seed.activityLogId
                }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        expect(response.status).toEqual(200);
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
                    activityLogId: seed.activityLogId
                }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        expect(response.status).toEqual(200);
    });

    it('should fail if passing incorrect authorization header ', async () => {
        const recordsUrl = `${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/sync/${seed.sync.id}/job/${seed.syncJob.id}/records`;
        const reqs = [`POST ${serverUrl}/environment/${seed.env.id}/log`, `POST ${recordsUrl}`, `PUT ${recordsUrl}`, `DELETE ${recordsUrl}`];

        for (const req of reqs) {
            const [method, url] = req.split(' ');
            if (method && url) {
                const res = await fetch(url, {
                    method,
                    headers: { Authorization: `Bearer WRONG_SECRET_KEY` }
                });
                expect(res.status).toEqual(401);
            } else {
                throw new Error('Invalid request');
            }
        }
    });

    it('should fail updating invalid records ', async () => {
        const model = 'MyModel';
        const records = [{ id: 'id'.repeat(200), name: 'new1' }];
        const response = await fetch(
            `${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/sync/${seed.sync.id}/job/${seed.syncJob.id}/records`,
            {
                method: 'PUT',
                body: JSON.stringify({
                    model,
                    records: records,
                    providerConfigKey: seed.connection.provider_config_key,
                    connectionId: seed.connection.connection_id,
                    activityLogId: seed.activityLogId
                }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        expect(response.status).toEqual(400);
        expect(await response.json()).toStrictEqual({
            error: {
                code: 'invalid_request',
                errors: [
                    {
                        code: 'too_big',
                        message: 'String must contain at most 255 character(s)',
                        path: ['records', 0, 'id']
                    }
                ]
            }
        });
    });

    describe('getCursor', () => {
        it('should return an empty response if no records', async () => {
            const model = 'does-not-exist';
            const cursorUrl = `${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/cursor?model=${model}&offset=last`;
            const response = await fetch(cursorUrl, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            expect(response.status).toEqual(200);
            expect(await response.json()).toStrictEqual({});
        });
        it('should return first cursor', async () => {
            const model = 'ModelFirstCursor';

            // Save records
            await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/sync/${seed.sync.id}/job/${seed.syncJob.id}/records`, {
                method: 'POST',
                body: JSON.stringify({
                    model,
                    records: [
                        { id: 1, name: 'r1' },
                        { id: 2, name: 'r2' },
                        { id: 3, name: 'r3' }
                    ],
                    providerConfigKey: seed.connection.provider_config_key,
                    connectionId: seed.connection.connection_id,
                    activityLogId: seed.activityLogId
                }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            const allRecords = (
                await records.getRecords({
                    connectionId: seed.connection.id!,
                    model
                })
            ).unwrap();
            const firstRecord = allRecords.records[0];

            const cursorUrl = `${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/cursor?model=${model}&offset=first`;
            const response = await fetch(cursorUrl, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            expect(response.status).toEqual(200);
            expect(await response.json()).toStrictEqual({
                cursor: firstRecord?._nango_metadata.cursor
            });
        });
        it('should return last cursor', async () => {
            const model = 'ModelLastCursor';

            // Save records
            await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/sync/${seed.sync.id}/job/${seed.syncJob.id}/records`, {
                method: 'POST',
                body: JSON.stringify({
                    model,
                    records: [
                        { id: 1, name: 'r1' },
                        { id: 2, name: 'r2' },
                        { id: 3, name: 'r3' }
                    ],
                    providerConfigKey: seed.connection.provider_config_key,
                    connectionId: seed.connection.connection_id,
                    activityLogId: seed.activityLogId
                }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            const allRecords = (
                await records.getRecords({
                    connectionId: seed.connection.id!,
                    model
                })
            ).unwrap();
            const lastRecord = allRecords.records[allRecords.records.length - 1];

            const cursorUrl = `${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/cursor?model=${model}&offset=last`;
            const response = await fetch(cursorUrl, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            expect(response.status).toEqual(200);
            expect(await response.json()).toStrictEqual({
                cursor: lastRecord?._nango_metadata.cursor
            });
        });
    });
});

const initDb = async () => {
    const now = new Date();
    const env = await environmentService.createEnvironment(0, 'testEnv');
    if (!env) throw new Error('Environment not created');

    const logCtx = await logContextGetter.create(
        { operation: { type: 'sync', action: 'run' } },
        { account: { id: env.account_id, name: '' }, environment: { id: env.id, name: env.name } }
    );

    const googleProvider = getProvider('google');
    if (!googleProvider) {
        throw new Error('google provider not found');
    }

    const providerConfig = await configService.createProviderConfig(
        {
            unique_key: 'provider-test',
            provider: 'google',
            environment_id: env.id,
            oauth_client_id: '',
            oauth_client_secret: '',
            missing_fields: []
        },
        googleProvider
    );
    if (!providerConfig) throw new Error('Provider config not created');

    const [syncConfig] = await db.knex
        .from<SyncConfig>(`_nango_sync_configs`)
        .insert({
            environment_id: env.id,
            sync_name: Math.random().toString(36).substring(7),
            type: 'sync',
            file_location: 'file_location',
            nango_config_id: providerConfig.id,
            version: '1',
            active: true,
            runs: 'runs',
            track_deletes: false,
            auto_start: false,
            webhook_subscriptions: [],
            enabled: true,
            created_at: now,
            updated_at: now,
            models: ['model'],
            model_schema: []
        } as SyncConfig)
        .returning('*');
    if (!syncConfig) throw new Error('Sync config not created');

    const connectionRes = await connectionService.upsertConnection({
        connectionId: `conn-test`,
        providerConfigKey: `provider-test`,
        provider: 'google',
        parsedRawCredentials: {} as AuthCredentials,
        connectionConfig: {},
        environmentId: env.id,
        accountId: 0
    });
    const connectionId = connectionRes[0]?.connection.id;
    if (!connectionId) throw new Error('Connection not created');

    const connection = await connectionService.getConnectionById(connectionId);
    if (!connection) throw new Error('Connection not found');

    const sync = await createSync(connectionId, syncConfig);
    if (!sync?.id) throw new Error('Sync not created');

    const syncJob = await createSyncJob({
        sync_id: sync.id,
        type: SyncType.FULL,
        status: SyncStatus.RUNNING,
        job_id: `job-test`,
        nangoConnection: connection
    });
    if (!syncJob) {
        throw new Error('Sync job not created');
    }

    return {
        account: (await accountService.getAccountById(0))!,
        env,
        activityLogId: logCtx.id,
        connection,
        sync,
        syncJob
    };
};

const clearDb = async () => {
    await db.knex.raw(`DROP SCHEMA nango CASCADE`);
};
