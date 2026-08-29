import fetch from 'node-fetch';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { logContextGetter, migrateLogsMapping } from '@nangohq/logs';
import { records } from '@nangohq/records';
import { formatRecords } from '@nangohq/records/lib/helpers/format.js';
import {
    accountService,
    configService,
    connectionService,
    createPlan,
    createSync,
    createSyncJob,
    environmentService,
    getProvider,
    secretService,
    seeders,
    SyncJobsType,
    SyncStatus
} from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { server } from './server.js';

import type { UnencryptedRecordData } from '@nangohq/records';
import type { Sync, Job as SyncJob } from '@nangohq/shared';
import type { AllAuthCredentials, DBAPISecret, DBEnvironment, DBPlan, DBSyncConfig, DBTeam } from '@nangohq/types';
import type { Server } from 'node:http';

const mockSecretKey = 'secret-key';

interface testSeed {
    account: DBTeam;
    env: DBEnvironment;
    secret: DBAPISecret;
    plan: DBPlan;
    activityLogId: string;
    connection: Exclude<Awaited<ReturnType<typeof connectionService.getConnectionById>>, null>;
    sync: Sync;
    syncJob: SyncJob;
}

describe('Persist API', () => {
    const port = 3096;
    const serverUrl = `http://localhost:${port}`;
    let httpServer: Server | undefined;
    let seed: testSeed;
    let otherTenantSeed: testSeed;
    const mockOtherTenantSecretKey = 'other-tenant-secret-key';

    beforeAll(async () => {
        await multipleMigrations();
        await records.migrate();
        await migrateLogsMapping();
        seed = await initDb();
        otherTenantSeed = await initDb();
        httpServer = await new Promise<Server>((resolve) => {
            const listener = server.listen(port, () => resolve(listener));
        });

        vi.spyOn(accountService, 'getPersistAuthContext').mockImplementation((key) => {
            if (key === mockSecretKey) {
                return Promise.resolve(
                    Ok({
                        account: { id: seed.account.id },
                        environment: { id: seed.env.id, name: seed.env.name },
                        plan: { id: seed.plan.id, name: seed.plan.name, records_store: seed.plan.records_store }
                    })
                );
            }
            if (key === mockOtherTenantSecretKey) {
                return Promise.resolve(
                    Ok({
                        account: { id: otherTenantSeed.account.id },
                        environment: { id: otherTenantSeed.env.id, name: otherTenantSeed.env.name },
                        plan: {
                            id: otherTenantSeed.plan.id,
                            name: otherTenantSeed.plan.name,
                            records_store: otherTenantSeed.plan.records_store
                        }
                    })
                );
            }
            return Promise.resolve(Ok(null));
        });
    });

    afterAll(async () => {
        vi.restoreAllMocks();
        if (httpServer) {
            await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
        }
    });

    it('should server /health', async () => {
        const response = await fetch(`${serverUrl}/health`);
        expect(response.status).toEqual(200);
        expect(await response.json()).toEqual({ status: 'ok' });
    });

    it('should log', async () => {
        const response = await fetch(`${serverUrl}/environment/${seed.env.id}/log`, {
            method: 'POST',
            body: JSON.stringify({
                activityLogId: seed.activityLogId,
                log: { type: 'log', level: 'info', message: 'Hello, world!', createdAt: new Date().toISOString() }
            }),
            headers: {
                Authorization: `Bearer ${mockSecretKey}`,
                'Content-Type': 'application/json'
            }
        });
        expect(response.status).toEqual(204);
    });

    it('should refuse huge log', async () => {
        const response = await fetch(`${serverUrl}/environment/${seed.env.id}/log`, {
            method: 'POST',
            body: JSON.stringify({ activityLogId: seed.activityLogId, log: { level: 'info', message: 'a'.repeat(150_000) } }),
            headers: {
                Authorization: `Bearer ${mockSecretKey}`,
                'Content-Type': 'application/json'
            }
        });
        expect(response.status).toEqual(400);
        expect(await response.json()).toStrictEqual({ error: { code: 'request_too_large', message: 'Entity too large' } });
    });

    describe('runner coordination', () => {
        const taskId = 'coordination-test-task';
        const syncId = 'coordination-test-sync';
        const lockOwner = 'test-owner';
        const lockKey = 'test-lock-key';

        it('should set and get abort flag', async () => {
            const putResponse = await fetch(`${serverUrl}/environment/${seed.env.id}/runner/task/${taskId}/abort`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${mockSecretKey}` }
            });
            expect(putResponse.status).toEqual(204);

            const getResponse = await fetch(`${serverUrl}/environment/${seed.env.id}/runner/task/${taskId}/abort`, {
                headers: { Authorization: `Bearer ${mockSecretKey}` }
            });
            expect(getResponse.status).toEqual(200);
            expect(await getResponse.json()).toEqual({ aborted: true });
        });

        it('should acquire and release sync conflict lock', async () => {
            const acquireResponse = await fetch(`${serverUrl}/environment/${seed.env.id}/runner/sync-conflict`, {
                method: 'PUT',
                body: JSON.stringify({ scriptType: 'sync', syncId, ttlMs: 60_000 }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            expect(acquireResponse.status).toEqual(204);

            const conflictResponse = await fetch(`${serverUrl}/environment/${seed.env.id}/runner/sync-conflict`, {
                method: 'PUT',
                body: JSON.stringify({ scriptType: 'sync', syncId, ttlMs: 60_000 }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            expect(conflictResponse.status).toEqual(409);
            expect(await conflictResponse.json()).toStrictEqual({
                error: { code: 'sync_conflict', message: 'Conflicting sync detected' }
            });

            const releaseResponse = await fetch(`${serverUrl}/environment/${seed.env.id}/runner/sync-conflict`, {
                method: 'DELETE',
                body: JSON.stringify({ scriptType: 'sync', syncId }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            expect(releaseResponse.status).toEqual(204);
        });

        it('should acquire, check, and release SDK locks', async () => {
            const acquireResponse = await fetch(`${serverUrl}/environment/${seed.env.id}/runner/locks/try-acquire`, {
                method: 'POST',
                body: JSON.stringify({ owner: lockOwner, key: lockKey, ttlMs: 60_000 }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            expect(acquireResponse.status).toEqual(200);
            expect(await acquireResponse.json()).toEqual({ acquired: true });

            const hasLockResponse = await fetch(
                `${serverUrl}/environment/${seed.env.id}/runner/locks?owner=${encodeURIComponent(lockOwner)}&key=${encodeURIComponent(lockKey)}`,
                { headers: { Authorization: `Bearer ${mockSecretKey}` } }
            );
            expect(hasLockResponse.status).toEqual(200);
            expect(await hasLockResponse.json()).toEqual({ hasLock: true });

            const releaseResponse = await fetch(`${serverUrl}/environment/${seed.env.id}/runner/locks/release`, {
                method: 'POST',
                body: JSON.stringify({ owner: lockOwner, key: lockKey }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            expect(releaseResponse.status).toEqual(200);
            expect(await releaseResponse.json()).toEqual({ released: true });
        });
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
                            message: 'Too small: expected array to have >=1 items',
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
                        activityLogId: seed.activityLogId,
                        merging: { strategy: 'override' }
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
                        code: 'invalid_union',
                        message: 'Invalid input',
                        path: ['records', '0', 'id']
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

            await insertRecords(seed, model, [
                { id: '1', name: 'r1' },
                { id: '2', name: 'r2' },
                { id: '3', name: 'r3' }
            ]);

            const allRecords = (
                await records.getRecords({
                    connectionId: seed.connection.id,
                    model,
                    plan: null
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

            await insertRecords(seed, model, [
                { id: '1', name: 'r1' },
                { id: '2', name: 'r2' },
                { id: '3', name: 'r3' }
            ]);

            const allRecords = (
                await records.getRecords({
                    connectionId: seed.connection.id,
                    model,
                    plan: null
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

    describe('getRecords', () => {
        it('should 400 if no model given', async () => {
            const response = await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/records`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });

            expect(response.status).toEqual(400);
        });

        it('should return records for a model', async () => {
            const model = 'GetRecordsModel';
            const records = [
                { id: '1', name: 'new1' },
                { id: '2', name: 'new2' }
            ];
            await insertRecords(seed, model, records);

            const response = await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/records?model=${model}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });

            expect(response.status).toEqual(200);
            const body = await response.json();
            expect(body).toMatchObject({
                records: expect.arrayContaining([expect.objectContaining(records[0]), expect.objectContaining(records[1])]),
                next_cursor: null
            });
        });

        it('should filter records by id', async () => {
            const model = 'GetRecordsFilteredModel';
            const records = [
                { id: '1', name: 'new1' },
                { id: '2', name: 'new2' },
                { id: '3', name: 'new3' }
            ];
            await insertRecords(seed, model, records);

            const response = await fetch(
                `${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/records?model=${model}&externalIds=1&externalIds=3`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${mockSecretKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            expect(response.status).toEqual(200);
            const body = await response.json();
            expect(body).toMatchObject({
                records: expect.arrayContaining([expect.objectContaining(records[0]), expect.objectContaining(records[2])]),
                next_cursor: null
            });
        });
    });

    describe('deleteOutdatedRecords', () => {
        it('should delete outdated records', async () => {
            const model = 'DeleteOutdatedModel';
            await insertRecords(seed, model, [
                { id: '1', name: 'new1' },
                { id: '2', name: 'new2' },
                { id: '3', name: 'new3' }
            ]);

            // create another sync job to simulate a new run
            const newSyncJob = await createSyncJob({
                sync_id: seed.sync.id,
                type: SyncJobsType.FULL,
                status: SyncStatus.RUNNING,
                job_id: `another-job`,
                nangoConnection: seed.connection
            });
            if (!newSyncJob) {
                throw new Error('Sync job not created');
            }

            await insertRecords(seed, model, [
                { id: '3', name: 'new3' },
                { id: '4', name: 'new4' },
                { id: '5', name: 'new5' }
            ]);

            const response = await fetch(
                `${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/sync/${seed.sync.id}/job/${newSyncJob.id}/outdated`,
                {
                    method: 'DELETE',
                    body: JSON.stringify({
                        model,
                        activityLogId: seed.activityLogId
                    }),
                    headers: {
                        Authorization: `Bearer ${mockSecretKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            expect(response.status).toEqual(200);
            expect(response.headers.get('content-type')).toEqual('application/x-ndjson');

            const lines = (await response.text())
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
                .map((line) => JSON.parse(line));

            for (const line of lines.slice(0, -1)) {
                expect(line).toMatchObject({ status: 'in_progress', deleted: expect.any(Number), page: expect.any(Number) });
            }
            expect(lines.at(-1)).toMatchObject({
                status: 'done',
                deletedKeys: expect.arrayContaining(['1', '2'])
            });
        });

        it('should write a terminal error line and still end the response when post-delete bookkeeping fails', async () => {
            const model = 'DeleteOutdatedBookkeepingFailureModel';
            await insertRecords(seed, model, [
                { id: '1', name: 'new1' },
                { id: '2', name: 'new2' }
            ]);

            const nonExistentSyncJobId = 999999999;
            const response = await fetch(
                `${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/sync/${seed.sync.id}/job/${nonExistentSyncJobId}/outdated`,
                {
                    method: 'DELETE',
                    body: JSON.stringify({ model, activityLogId: seed.activityLogId }),
                    headers: {
                        Authorization: `Bearer ${mockSecretKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            expect(response.status).toEqual(200);
            expect(response.headers.get('content-type')).toEqual('application/x-ndjson');

            const lines = (await response.text())
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
                .map((line) => JSON.parse(line));

            expect(lines.at(-1)).toMatchObject({
                status: 'error',
                error: { code: 'delete_outdated_records_failed', message: expect.stringContaining('Failed to query sync job') }
            });
        });
    });

    describe('deleteHardRecords', () => {
        it('should hard delete all records for a model', async () => {
            const model = 'DeleteHardModel';
            await insertRecords(seed, model, [
                { id: '1', name: 'r1' },
                { id: '2', name: 'r2' },
                { id: '3', name: 'r3' }
            ]);

            const response = await fetch(
                `${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/sync/${seed.sync.id}/job/${seed.syncJob.id}/records/hard`,
                {
                    method: 'DELETE',
                    body: JSON.stringify({ model }),
                    headers: {
                        Authorization: `Bearer ${mockSecretKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            expect(response.status).toEqual(200);
            const body = await response.json();
            expect(body).toMatchObject({ deletedCount: 3, hasMore: false });
        });

        it('should return 400 when model is missing', async () => {
            const response = await fetch(
                `${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/sync/${seed.sync.id}/job/${seed.syncJob.id}/records/hard`,
                {
                    method: 'DELETE',
                    body: JSON.stringify({}),
                    headers: {
                        Authorization: `Bearer ${mockSecretKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            expect(response.status).toEqual(400);
        });
    });

    describe('checkpoint', () => {
        it('should return 404 if checkpoint not found', async () => {
            const response = await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/checkpoint?key=non-existent`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            expect(response.status).toEqual(404);
            expect(await response.json()).toMatchObject({ error: { code: 'checkpoint_not_found' } });
        });

        it('should create/get a new checkpoint', async () => {
            const key = 'test-checkpoint-create';
            const checkpoint = { status: 'running', count: 10 };

            const createResponse = await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/checkpoint`, {
                method: 'PUT',
                body: JSON.stringify({ key, checkpoint, expectedVersion: 1 }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            expect(createResponse.status).toEqual(200);
            expect(await createResponse.json()).toStrictEqual({ checkpoint, version: 1 });

            const response = await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/checkpoint?key=${key}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            expect(response.status).toEqual(200);
            expect(await response.json()).toStrictEqual({ checkpoint, version: 1, deletedAt: null });
        });

        it('should update checkpoint', async () => {
            const key = 'test-checkpoint-update';
            const checkpoint1 = { step: 1 };
            const checkpoint2 = { step: 2 };

            await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/checkpoint`, {
                method: 'PUT',
                body: JSON.stringify({ key, checkpoint: checkpoint1, expectedVersion: 1 }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const response = await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/checkpoint`, {
                method: 'PUT',
                body: JSON.stringify({ key, checkpoint: checkpoint2, expectedVersion: 1 }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            expect(response.status).toEqual(200);
            expect(await response.json()).toStrictEqual({ checkpoint: checkpoint2, version: 2 });
        });

        it('should return 409 on version conflict for PUT', async () => {
            const key = 'test-checkpoint-update-conflict';
            const checkpoint = { data: 'initial' };

            await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/checkpoint`, {
                method: 'PUT',
                body: JSON.stringify({ key, checkpoint, expectedVersion: 1 }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const response = await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/checkpoint`, {
                method: 'PUT',
                body: JSON.stringify({ key, checkpoint: { data: 'updated' }, expectedVersion: 99 }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            expect(response.status).toEqual(409);
            expect(await response.json()).toMatchObject({ error: { code: 'checkpoint_conflict' } });
        });

        it('should delete checkpoint', async () => {
            const key = 'test-checkpoint-delete';
            const checkpoint = { toDelete: true };

            await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/checkpoint`, {
                method: 'PUT',
                body: JSON.stringify({ key, checkpoint, expectedVersion: 1 }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const deleteResponse = await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/checkpoint`, {
                method: 'DELETE',
                body: JSON.stringify({ key, expectedVersion: 1 }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            expect(deleteResponse.status).toEqual(204);

            const getResponse = await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/checkpoint?key=${key}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            expect(getResponse.status).toEqual(200);
            const body = (await getResponse.json()) as { checkpoint: object; version: number; deletedAt: string | null };
            expect(body).toMatchObject({ checkpoint, version: 2, deletedAt: expect.toBeIsoDate() });
        });

        it('should return 409 on version conflict for DELETE', async () => {
            const key = 'test-checkpoint-delete-conflict';
            const checkpoint = { data: 'to-delete' };

            await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/checkpoint`, {
                method: 'PUT',
                body: JSON.stringify({ key, checkpoint, expectedVersion: 1 }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const response = await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/checkpoint`, {
                method: 'DELETE',
                body: JSON.stringify({ key, expectedVersion: 99 }),
                headers: {
                    Authorization: `Bearer ${mockSecretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            expect(response.status).toEqual(409);
            expect(await response.json()).toMatchObject({ error: { code: 'checkpoint_conflict' } });
        });
    });

    describe('connection ownership', () => {
        const authHeaders = { Authorization: `Bearer ${mockSecretKey}`, 'Content-Type': 'application/json' };

        it("rejects a read on another tenant's connection (getRecords)", async () => {
            const response = await fetch(
                `${serverUrl}/environment/${seed.env.id}/connection/${otherTenantSeed.connection.id}/records?model=Account&limit=100`,
                { headers: authHeaders }
            );
            expect(response.status).toEqual(404);
            expect(await response.json()).toMatchObject({ error: { code: 'connection_not_found' } });
        });

        it("rejects a cursor lookup on another tenant's connection (getCursor)", async () => {
            const response = await fetch(
                `${serverUrl}/environment/${seed.env.id}/connection/${otherTenantSeed.connection.id}/cursor?model=Account&offset=first`,
                { headers: authHeaders }
            );
            expect(response.status).toEqual(404);
            expect(await response.json()).toMatchObject({ error: { code: 'connection_not_found' } });
        });

        it("rejects a checkpoint write on another tenant's connection (putCheckpoint)", async () => {
            const response = await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${otherTenantSeed.connection.id}/checkpoint`, {
                method: 'PUT',
                body: JSON.stringify({ key: 'k', checkpoint: {}, expectedVersion: 1 }),
                headers: authHeaders
            });
            expect(response.status).toEqual(404);
            expect(await response.json()).toMatchObject({ error: { code: 'connection_not_found' } });
        });

        it("rejects a soft-delete of another tenant's outdated records (deleteOutdatedRecords)", async () => {
            const response = await fetch(
                `${serverUrl}/environment/${seed.env.id}/connection/${otherTenantSeed.connection.id}/sync/x/job/${Number.MAX_SAFE_INTEGER}/outdated`,
                {
                    method: 'DELETE',
                    body: JSON.stringify({ model: 'Account', activityLogId: seed.activityLogId }),
                    headers: authHeaders
                }
            );
            expect(response.status).toEqual(404);
            expect(await response.json()).toMatchObject({ error: { code: 'connection_not_found' } });
        });

        it("rejects a permanent hard-delete of another tenant's records (deleteHardRecords)", async () => {
            const response = await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${otherTenantSeed.connection.id}/sync/x/job/1/records/hard`, {
                method: 'DELETE',
                body: JSON.stringify({ model: 'Account' }),
                headers: authHeaders
            });
            expect(response.status).toEqual(404);
            expect(await response.json()).toMatchObject({ error: { code: 'connection_not_found' } });
        });

        it("rejects a write of records onto another tenant's connection (postRecords, the shared recordsPath route)", async () => {
            const response = await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${otherTenantSeed.connection.id}/sync/x/job/1/records`, {
                method: 'POST',
                body: JSON.stringify({
                    model: 'Account',
                    records: [{ id: '1' }],
                    providerConfigKey: 'provider-test',
                    connectionId: otherTenantSeed.connection.connection_id,
                    activityLogId: seed.activityLogId,
                    merging: { strategy: 'override' }
                }),
                headers: authHeaders
            });
            expect(response.status).toEqual(404);
            expect(await response.json()).toMatchObject({ error: { code: 'connection_not_found' } });
        });

        it('rejects a nonexistent connection id with the same 404, not a different error', async () => {
            const response = await fetch(`${serverUrl}/environment/${seed.env.id}/connection/999999999/records?model=Account&limit=100`, {
                headers: authHeaders
            });
            expect(response.status).toEqual(404);
            expect(await response.json()).toMatchObject({ error: { code: 'connection_not_found' } });
        });

        it('parses a scientific-notation connection id the same way the route\'s own zod schema does (regression: parseInt and Number disagree on "1e2")', async () => {
            // Under parseInt, "<id>e2" is just <id> — the caller's own real connection. Under
            // Number (what the route's z.coerce.number().int().positive() schema uses
            // downstream), it's <id> * 100 — a different, near-certainly nonexistent id. If this
            // middleware parsed with parseInt, it would authorize against the caller's own real
            // connection while the route handler went on to act on a completely different
            // numeric id, defeating the ownership check entirely.
            const scientificNotationId = `${seed.connection.id}e2`;
            const response = await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${scientificNotationId}/records?model=Account&limit=100`, {
                headers: authHeaders
            });
            expect(response.status).toEqual(404);
            expect(await response.json()).toMatchObject({ error: { code: 'connection_not_found' } });
        });

        it('still allows a tenant to access its own connection (no regression)', async () => {
            const response = await fetch(`${serverUrl}/environment/${seed.env.id}/connection/${seed.connection.id}/records?model=Account&limit=100`, {
                headers: authHeaders
            });
            expect(response.status).toEqual(200);
        });

        it("also rejects the other tenant reaching into this seed's connection, using its own valid credentials", async () => {
            const response = await fetch(
                `${serverUrl}/environment/${otherTenantSeed.env.id}/connection/${seed.connection.id}/records?model=Account&limit=100`,
                {
                    headers: { Authorization: `Bearer ${mockOtherTenantSecretKey}`, 'Content-Type': 'application/json' }
                }
            );
            expect(response.status).toEqual(404);
            expect(await response.json()).toMatchObject({ error: { code: 'connection_not_found' } });
        });
    });
});

const initDb = async () => {
    const now = new Date();
    const account = await seeders.createAccount();
    const env = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: 'testEnv' })).unwrap();
    const secret = (await secretService.getDefaultSecretForEnv(db.knex, env)).unwrap();

    const plan = (await createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();

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
            missing_fields: [],
            forward_webhooks: true,
            shared_credentials_id: null
        },
        googleProvider
    );
    if (!providerConfig) throw new Error('Provider config not created');

    const [syncConfig] = await db.knex
        .from<DBSyncConfig>(`_nango_sync_configs`)
        .insert({
            environment_id: env.id,
            sync_name: Math.random().toString(36).substring(7),
            type: 'sync',
            file_location: 'file_location',
            nango_config_id: providerConfig.id!,
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
            sync_type: 'full',
            source: 'repo'
        })
        .returning('*');
    if (!syncConfig) throw new Error('Sync config not created');

    const connectionRes = await connectionService.upsertConnection({
        connectionId: `conn-test`,
        providerConfigKey: `provider-test`,
        parsedRawCredentials: {} as AllAuthCredentials,
        connectionConfig: {},
        environmentId: env.id,
        tags: {}
    });
    const connectionId = connectionRes[0]?.connection.id;
    if (!connectionId) throw new Error('Connection not created');

    const connection = await connectionService.getConnectionById(connectionId);
    if (!connection) throw new Error('Connection not found');

    const sync = await createSync({ connectionId, syncConfig, variant: 'base' });
    if (!sync?.id) throw new Error('Sync not created');

    const syncJob = await createSyncJob({
        sync_id: sync.id,
        type: SyncJobsType.FULL,
        status: SyncStatus.RUNNING,
        job_id: `job-test`,
        nangoConnection: connection
    });
    if (!syncJob) {
        throw new Error('Sync job not created');
    }

    return {
        account,
        env,
        secret,
        plan,
        activityLogId: logCtx.id,
        connection,
        sync,
        syncJob
    };
};

const insertRecords = async (seed: testSeed, model: string, toInsert: UnencryptedRecordData[]) => {
    const formatted = formatRecords({
        data: toInsert,
        connectionId: seed.connection.id,
        model,
        syncId: seed.sync.id,
        syncJobId: seed.syncJob.id
    }).unwrap();

    await records.upsert({
        connectionId: seed.connection.id,
        environmentId: seed.env.id,
        model,
        records: formatted,
        plan: null
    });
};
