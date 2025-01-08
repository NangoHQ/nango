import { expect, describe, it, beforeAll, afterAll, vi } from 'vitest';
import { multipleMigrations } from '@nangohq/database';
import type { UnencryptedRecordData, ReturnedRecord } from '@nangohq/records';
import { records as recordsService, format as recordsFormatter, migrate as migrateRecords, clearDbTestsOnly as clearRecordsDb } from '@nangohq/records';
import { handleSyncSuccess, startSync } from './sync.js';
import type { TaskAction, TaskOnEvent, TaskSync, TaskSyncAbort, TaskWebhook } from '@nangohq/nango-orchestrator';
import type { Connection, Sync, SyncResult, Job as SyncJob, SyncConfig } from '@nangohq/shared';
import { isSyncJobRunning, seeders, getLatestSyncJob, updateSyncJobResult } from '@nangohq/shared';
import { Ok, stringifyError } from '@nangohq/utils';
import { envs } from '../env.js';

const mockStartScript = vi.fn(() => Promise.resolve(Ok(undefined)));

describe('Running sync', () => {
    beforeAll(async () => {
        await initDb();
        envs.NANGO_LOGS_ENABLED = false;
    });

    afterAll(async () => {
        await clearRecordsDb();
    });

    describe(`with track_deletes=false`, () => {
        const trackDeletes = false;
        it(`should report no records have changed`, async () => {
            const rawRecords = [
                { id: '1', name: 'a' },
                { id: '2', name: 'b' }
            ];
            const expectedResult = { added: 0, updated: 0, deleted: 0 };
            const { records } = await verifySyncRun(rawRecords, rawRecords, expectedResult, trackDeletes);
            records.forEach((record) => {
                expect(record._nango_metadata.first_seen_at).toEqual(record._nango_metadata.last_modified_at);
                expect(record._nango_metadata.deleted_at).toBeNull();
                expect(record._nango_metadata.last_action).toEqual('ADDED');
            });
        });

        it(`should report one record has been added and one modified`, async () => {
            const rawRecords = [
                { id: '1', name: 'a' },
                { id: '2', name: 'b' }
            ];
            const newRecords = [
                { id: '1', name: 'A' },
                { id: '3', name: 'c' }
            ];
            const expectedResult = { added: 1, updated: 1, deleted: 0 };
            const { records } = await verifySyncRun(rawRecords, newRecords, expectedResult, trackDeletes);

            const record1 = records.find((record) => record.id == '1');
            if (!record1) throw new Error('record1 is not defined');
            expect(record1['name']).toEqual('A');
            expect(record1._nango_metadata.first_seen_at < record1._nango_metadata.last_modified_at).toBeTruthy();
            expect(record1._nango_metadata.deleted_at).toBeNull();
            expect(record1._nango_metadata.last_action).toEqual('UPDATED');

            const record2 = records.find((record) => record.id == '2');
            if (!record2) throw new Error('record2 is not defined');
            expect(record2._nango_metadata.first_seen_at).toEqual(record2._nango_metadata.last_modified_at);
            expect(record2._nango_metadata.last_action).toEqual('ADDED'); // record was added as part of the initial save
            const record3 = records.find((record) => record.id == '3');
            if (!record3) throw new Error('record3 is not defined');
            expect(record3._nango_metadata.first_seen_at).toEqual(record3._nango_metadata.last_modified_at);
            expect(record3._nango_metadata.last_action).toEqual('ADDED');
        });
    });

    describe(`with track_deletes=true`, () => {
        const trackDeletes = true;
        it(`should report no records have changed`, async () => {
            const rawRecords = [
                { id: '1', name: 'a' },
                { id: '2', name: 'b' }
            ];
            const expectedResult = { added: 0, updated: 0, deleted: 0 };
            const { records } = await verifySyncRun(rawRecords, rawRecords, expectedResult, trackDeletes);
            expect(records).lengthOf(2);
            records.forEach((record) => {
                expect(record._nango_metadata.first_seen_at).toEqual(record._nango_metadata.last_modified_at);
                expect(record._nango_metadata.deleted_at).toBeNull();
                expect(record._nango_metadata.last_action).toEqual('ADDED');
            });
        });

        it(`should report one record has been added, one updated and one deleted`, async () => {
            const rawRecords = [
                { id: '1', name: 'a' },
                { id: '2', name: 'b' }
            ];
            const newRecords = [
                { id: '1', name: 'A' },
                { id: '3', name: 'c' }
            ];
            const expectedResult = { added: 1, updated: 1, deleted: 1 };
            const { records } = await verifySyncRun(rawRecords, newRecords, expectedResult, trackDeletes);
            const record1 = records.find((record) => record.id == '1');
            if (!record1) throw new Error('record1 is not defined');
            expect(record1['name']).toEqual('A');
            expect(record1._nango_metadata.first_seen_at < record1._nango_metadata.last_modified_at).toBeTruthy();
            expect(record1._nango_metadata.deleted_at).toBeNull();
            expect(record1._nango_metadata.last_action).toEqual('UPDATED');
            const record2 = records.find((record) => record.id == '2');
            if (!record2) throw new Error('record2 is not defined');
            expect(record2._nango_metadata.first_seen_at < record2._nango_metadata.last_modified_at).toBeTruthy();
            expect(record2._nango_metadata.deleted_at).not.toBeNull();
            expect(record2._nango_metadata.last_action).toEqual('DELETED');
            const record3 = records.find((record) => record.id == '3');
            if (!record3) throw new Error('record3 is not defined');
            expect(record3._nango_metadata.first_seen_at).toEqual(record3._nango_metadata.last_modified_at);
            expect(record3._nango_metadata.last_action).toEqual('ADDED');
        });

        it(`should undelete record`, async () => {
            const initialRecords = [
                { id: '1', name: 'a' },
                { id: '2', name: 'b' }
            ];
            const expectedResult = { added: 0, updated: 0, deleted: 0 };
            const { connection, sync, model, syncConfig } = await verifySyncRun(initialRecords, initialRecords, expectedResult, trackDeletes);

            // records '2' is going to be deleted
            const newRecords = [{ id: '1', name: 'a' }];
            await runJob(newRecords, connection, sync, syncConfig, false);

            const records = await getRecords(connection, model);
            const record = records.find((record) => record.id == '2');
            if (!record) throw new Error('record is not defined');
            expect(record._nango_metadata.first_seen_at < record._nango_metadata.last_modified_at).toBeTruthy();
            expect(record._nango_metadata.deleted_at).not.toBeNull();
            expect(record._nango_metadata.last_action).toEqual('DELETED');

            // records '2' should be back
            const result = await runJob(initialRecords, connection, sync, syncConfig, false);
            expect(result).toEqual({ added: 1, updated: 0, deleted: 0 });

            const recordsAfter = await getRecords(connection, model);
            const recordAfter = recordsAfter.find((record) => record.id == '2');
            if (!recordAfter) throw new Error('record is not defined');
            expect(recordAfter._nango_metadata.first_seen_at).toEqual(recordAfter._nango_metadata.last_modified_at);
            expect(recordAfter._nango_metadata.deleted_at).toBeNull();
            expect(recordAfter._nango_metadata.last_action).toEqual('ADDED');
        });
    });

    describe(`with softDelete=true`, () => {
        const softDelete = true;
        const trackDeletes = false;
        it(`should report records have been deleted`, async () => {
            const rawRecords = [
                { id: '1', name: 'a' },
                { id: '2', name: 'b' }
            ];
            const expectedResult = { added: 0, updated: 0, deleted: 2 };
            const { records } = await verifySyncRun(rawRecords, rawRecords, expectedResult, trackDeletes, softDelete);
            expect(records).lengthOf(2);
            records.forEach((record) => {
                expect(record._nango_metadata.deleted_at).toEqual(record._nango_metadata.last_modified_at);
                expect(record._nango_metadata.deleted_at).not.toBeNull();
                expect(record._nango_metadata.last_action).toEqual('DELETED');
            });
        });
    });
});

const initDb = async () => {
    await multipleMigrations();
    await migrateRecords();
};

const runJob = async (
    rawRecords: UnencryptedRecordData[],
    connection: Connection,
    sync: Sync,
    syncConfig: SyncConfig,
    softDelete: boolean
): Promise<SyncResult> => {
    const task: TaskSync = {
        id: 'task-id',
        name: 'task-name',
        syncId: sync.id,
        syncName: sync.name,
        groupKey: 'group-key',
        attempt: 0,
        state: 'CREATED',
        debug: false,
        connection: {
            id: connection.id!,
            environment_id: connection.environment_id,
            provider_config_key: connection.provider_config_key,
            connection_id: connection.connection_id
        },
        isSync: (): this is TaskSync => true,
        isWebhook: (): this is TaskWebhook => false,
        isAction: (): this is TaskAction => false,
        isOnEvent: (): this is TaskOnEvent => false,
        isSyncAbort: (): this is TaskSyncAbort => false
    };
    const nangoProps = await startSync(task, mockStartScript);
    if (nangoProps.isErr()) {
        throw new Error(`failed to start sync: ${stringifyError(nangoProps.error)}`);
    }

    // check that sync job is running
    const syncJob = await isSyncJobRunning(task.syncId);
    if (!syncJob || syncJob.run_id !== 'task-id' || !syncJob.log_id) {
        throw new Error(`Incorrect sync job detected: ${syncJob?.id}`);
    }

    const model = syncConfig.models[0]!;
    // format and upsert records
    const formatting = recordsFormatter.formatRecords({
        data: rawRecords,
        connectionId: connection.id as number,
        model: model,
        syncId: sync.id,
        syncJobId: syncJob.id,
        softDelete
    });
    if (formatting.isErr()) {
        throw new Error(`failed to format records`);
    }
    const upserting = await recordsService.upsert({
        records: formatting.value,
        connectionId: connection.id as number,
        environmentId: connection.environment_id,
        model,
        softDelete
    });
    if (upserting.isErr()) {
        throw new Error(`failed to upsert records: ${upserting.error.message}`);
    }
    const summary = upserting.value;
    const updatedResults = {
        [model]: {
            added: summary.addedKeys.length,
            updated: summary.updatedKeys.length,
            deleted: summary.deletedKeys?.length || 0
        }
    };
    await updateSyncJobResult(syncJob.id, updatedResults, model);

    await handleSyncSuccess({ nangoProps: nangoProps.value });

    const latestSyncJob = await getLatestSyncJob(sync.id);
    if (!latestSyncJob) {
        throw new Error('failed to get latest sync job');
    }

    expect(latestSyncJob.status).toEqual('SUCCESS');

    return {
        added: latestSyncJob.result?.[model]?.added || 0,
        updated: latestSyncJob.result?.[model]?.updated || 0,
        deleted: latestSyncJob.result?.[model]?.deleted || 0
    };
};

const verifySyncRun = async (
    initialRecords: UnencryptedRecordData[],
    newRecords: UnencryptedRecordData[],
    expectedResult: SyncResult,
    trackDeletes: boolean,
    softDelete = false
): Promise<{ connection: Connection; model: string; sync: Sync; syncConfig: SyncConfig; records: ReturnedRecord[] }> => {
    // Write initial records
    const { connection, model, sync, syncConfig } = await populateRecords(initialRecords, trackDeletes);

    // Run job to save new records
    const result = await runJob(newRecords, connection, sync, syncConfig, softDelete);

    expect(result).toEqual(expectedResult);

    const records = await getRecords(connection, model);
    return { connection, model, sync, syncConfig, records };
};

const getRecords = async (connection: Connection, model: string) => {
    const res = await recordsService.getRecords({ connectionId: connection.id!, model });
    if (res.isOk()) {
        return res.value.records;
    }
    throw new Error('cannot fetch records');
};

async function populateRecords(
    toInsert: UnencryptedRecordData[],
    trackDeletes: boolean
): Promise<{
    connection: Connection;
    model: string;
    sync: Sync;
    syncConfig: SyncConfig;
    syncJob: SyncJob;
}> {
    const {
        records,
        meta: { model, connection, sync, syncJob, syncConfig }
    } = await seeds(toInsert, trackDeletes);

    const chunkSize = 1000;
    for (let i = 0; i < records.length; i += chunkSize) {
        const res = await recordsService.upsert({
            records: records.slice(i, i + chunkSize),
            connectionId: connection.id!,
            environmentId: connection.environment_id,
            model
        });
        if (res.isErr()) {
            throw new Error(`Failed to upsert records: ${res.error.message}`);
        }
    }
    return {
        connection: connection as Connection,
        model,
        sync,
        syncConfig,
        syncJob
    };
}

async function seeds(records: UnencryptedRecordData[], trackDeletes: boolean) {
    const { env } = await seeders.seedAccountEnvAndUser();
    const model = 'GithubIssue';

    const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

    if (!connection.id) {
        throw new Error('Failed to create connection');
    }

    const config = await seeders.createConfigSeed(env, 'github', 'github');
    const { syncConfig, sync } = await seeders.createSyncSeeds({
        connectionId: connection.id,
        environment_id: env.id,
        nango_config_id: config.id!,
        sync_name: Math.random().toString(36).substring(7),
        track_deletes: trackDeletes,
        models: [model]
    });

    const job = await seeders.createSyncJobSeeds(sync.id);
    if (!job.id) {
        throw new Error('Failed to create job');
    }
    const formattedRecords = recordsFormatter.formatRecords({ data: records, connectionId: connection.id, model, syncId: sync.id, syncJobId: job.id });

    if (formattedRecords.isErr()) {
        throw new Error(`Failed to format records: ${formattedRecords.error.message}`);
    }

    return {
        meta: {
            env,
            connection,
            model,
            sync,
            syncConfig,
            syncJob: job
        },
        records: formattedRecords.value
    };
}
