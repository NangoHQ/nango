import { expect, describe, it, beforeAll, afterAll } from 'vitest';
import db from '../../db/database.js';
import SyncRun from './run.service.js';
import { SyncStatus, SyncType } from '../../models/Sync.js';
import * as database from '../../db/database.js';
import * as dataMocks from './data/mocks.js';
import * as dataService from './data/data.service.js';
import * as recordsService from './data/records.service.js';
import * as jobService from './job.service.js';
import type { CustomerFacingDataRecord, IntegrationServiceInterface, Sync, Job as SyncJob, SyncResult } from '../../models/Sync.js';
import type { DataResponse } from '../../models/Data.js';
import type { Connection } from '../../models/Connection.js';
import { LogContext } from '@nangohq/logs';

class integrationServiceMock implements IntegrationServiceInterface {
    async runScript() {
        return {
            success: true
        };
    }
    async cancelScript() {
        return;
    }
}

const integrationService = new integrationServiceMock();

describe('Running sync', () => {
    beforeAll(async () => {
        await database.multipleMigrations();
    });

    afterAll(async () => {
        await clearDb();
    });

    describe(`with track_deletes=false`, () => {
        const trackDeletes = false;
        it(`should report no records have changed`, async () => {
            const rawRecords = [
                { id: '1', name: 'a' },
                { id: '2', name: 'b' }
            ];
            const expectedResult = { added: 0, updated: 0, deleted: 0 };
            const { records } = await verifySyncRun(rawRecords, rawRecords, trackDeletes, expectedResult);
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
            const { records } = await verifySyncRun(rawRecords, newRecords, trackDeletes, expectedResult);

            const record1 = records.find((record) => record.id == 1);
            if (!record1) throw new Error('record1 is not defined');
            expect(record1['name']).toEqual('A');
            expect(record1._nango_metadata.first_seen_at < record1._nango_metadata.last_modified_at).toBeTruthy();
            expect(record1._nango_metadata.deleted_at).toBeNull();
            expect(record1._nango_metadata.last_action).toEqual('UPDATED');

            const record2 = records.find((record) => record.id == 2);
            if (!record2) throw new Error('record2 is not defined');
            expect(record2._nango_metadata.first_seen_at).toEqual(record2._nango_metadata.last_modified_at);
            expect(record2._nango_metadata.last_action).toEqual('ADDED'); // record was added as part of the initial save
            const record3 = records.find((record) => record.id == 3);
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
            const { records } = await verifySyncRun(rawRecords, rawRecords, trackDeletes, expectedResult);
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
            const { records } = await verifySyncRun(rawRecords, newRecords, trackDeletes, expectedResult);
            const record1 = records.find((record) => record.id == 1);
            if (!record1) throw new Error('record1 is not defined');
            expect(record1['name']).toEqual('A');
            expect(record1._nango_metadata.first_seen_at < record1._nango_metadata.last_modified_at).toBeTruthy();
            expect(record1._nango_metadata.deleted_at).toBeNull();
            expect(record1._nango_metadata.last_action).toEqual('UPDATED');
            const record2 = records.find((record) => record.id == 2);
            if (!record2) throw new Error('record2 is not defined');
            expect(record2._nango_metadata.first_seen_at < record2._nango_metadata.last_modified_at).toBeTruthy();
            expect(record2._nango_metadata.deleted_at).not.toBeNull();
            expect(record2._nango_metadata.last_action).toEqual('DELETED');
            const record3 = records.find((record) => record.id == 3);
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
            const { connection, sync, model, activityLogId } = await verifySyncRun(initialRecords, initialRecords, false, expectedResult);

            // records '2' is going to be deleted
            const newRecords = [{ id: '1', name: 'a' }];
            await runJob(newRecords, activityLogId, model, connection, sync, trackDeletes, false);

            const records = await getRecords(connection, model);
            const record = records.find((record) => record.id == 2);
            if (!record) throw new Error('record is not defined');
            expect(record._nango_metadata.first_seen_at < record._nango_metadata.last_modified_at).toBeTruthy();
            expect(record._nango_metadata.deleted_at).not.toBeNull();
            expect(record._nango_metadata.last_action).toEqual('DELETED');

            // records '2' should be back
            const result = await runJob(initialRecords, activityLogId, model, connection, sync, trackDeletes, false);
            expect(result).toEqual({ added: 1, updated: 0, deleted: 0 });

            const recordsAfter = await getRecords(connection, model);
            const recordAfter = recordsAfter.find((record) => record.id == 2);
            if (!recordAfter) throw new Error('record is not defined');
            expect(recordAfter._nango_metadata.first_seen_at).toEqual(recordAfter._nango_metadata.last_modified_at);
            expect(recordAfter._nango_metadata.deleted_at).toBeNull();
            expect(recordAfter._nango_metadata.last_action).toEqual('ADDED');
        });
    });
    describe(`with softDelete=true`, () => {
        const softDelete = true;
        it(`should report records have been deleted`, async () => {
            const rawRecords = [
                { id: '1', name: 'a' },
                { id: '2', name: 'b' }
            ];
            const expectedResult = { added: 0, updated: 0, deleted: 2 };
            const { records } = await verifySyncRun(rawRecords, rawRecords, false, expectedResult, softDelete);
            expect(records).lengthOf(2);
            records.forEach((record) => {
                expect(record._nango_metadata.deleted_at).toEqual(record._nango_metadata.last_modified_at);
                expect(record._nango_metadata.deleted_at).not.toBeNull();
                expect(record._nango_metadata.last_action).toEqual('DELETED');
            });
        });
    });
});

describe('SyncRun', () => {
    it('should initialize correctly', () => {
        const config = {
            integrationService: integrationService as unknown as IntegrationServiceInterface,
            writeToDb: true,
            nangoConnection: {
                id: 1,
                connection_id: '1234',
                provider_config_key: 'test_key',
                environment_id: 1
            },
            syncName: 'test_sync',
            syncType: SyncType.INCREMENTAL,
            syncId: 'some-sync',
            syncJobId: 123,
            activityLogId: 123,
            loadLocation: '/tmp',
            debug: true
        };

        const syncRun = new SyncRun(config);

        expect(syncRun).toBeTruthy();
        expect(syncRun.writeToDb).toEqual(true);
        expect(syncRun.nangoConnection.connection_id).toEqual('1234');
        expect(syncRun.syncName).toEqual('test_sync');
        expect(syncRun.syncType).toEqual(SyncType.INCREMENTAL);
        expect(syncRun.syncId).toEqual('some-sync');
        expect(syncRun.syncJobId).toEqual(123);
        expect(syncRun.activityLogId).toEqual(123);
        expect(syncRun.loadLocation).toEqual('/tmp');
        expect(syncRun.debug).toEqual(true);
    });
});

const clearDb = async () => {
    await db.knex.raw(`DROP SCHEMA nango CASCADE`);
};

const runJob = async (
    rawRecords: DataResponse[],
    activityLogId: number,
    model: string,
    connection: Connection,
    sync: Sync,
    trackDeletes: boolean,
    softDelete: boolean
): Promise<SyncResult> => {
    // create new sync job
    const syncJob = (await jobService.createSyncJob(sync.id, SyncType.INCREMENTAL, SyncStatus.RUNNING, 'test-job-id', connection)) as SyncJob;
    if (!syncJob) {
        throw new Error('Fail to create sync job');
    }
    const config = {
        integrationService: integrationService,
        writeToDb: true,
        nangoConnection: connection,
        syncName: sync.name,
        syncType: SyncType.INITIAL,
        syncId: sync.id,
        syncJobId: syncJob.id,
        activityLogId
    };
    const syncRun = new SyncRun(config);

    // format and upsert records
    const { response: records } = recordsService.formatDataRecords(rawRecords, connection.id!, model, sync.id, syncJob.id, softDelete);
    if (!records) {
        throw new Error(`failed to format records`);
    }

    const logCtx = new LogContext({ parentId: String(activityLogId) }, { dryRun: true, logToConsole: false });
    const { error: upsertError, summary } = await dataService.upsert(
        records,
        connection.id!,
        model,
        activityLogId,
        connection.environment_id,
        softDelete,
        logCtx
    );
    if (upsertError) {
        throw new Error(`failed to upsert records: ${upsertError}`);
    }
    const updatedResults = {
        [model]: {
            added: summary?.addedKeys.length as number,
            updated: summary?.updatedKeys.length as number,
            deleted: summary?.deletedKeys?.length as number
        }
    };
    await jobService.updateSyncJobResult(syncJob.id, updatedResults, model);
    // finish the sync
    await syncRun.finishFlow([model], new Date(), `v1`, 10, trackDeletes);

    const syncJobResult = await jobService.getLatestSyncJob(sync.id);
    return {
        added: syncJobResult?.result?.[model]?.added || 0,
        updated: syncJobResult?.result?.[model]?.updated || 0,
        deleted: syncJobResult?.result?.[model]?.deleted || 0
    };
};

const verifySyncRun = async (
    initialRecords: DataResponse[],
    newRecords: DataResponse[],
    trackDeletes: boolean,
    expectedResult: SyncResult,
    softDelete: boolean = false
): Promise<{ connection: Connection; model: string; sync: Sync; activityLogId: number; records: CustomerFacingDataRecord[] }> => {
    // Write initial records
    const { connection, model, sync, activityLogId } = await dataMocks.upsertRecords(initialRecords);

    // Run job to save new records
    const result = await runJob(newRecords, activityLogId, model, connection, sync, trackDeletes, softDelete);

    expect(result).toEqual(expectedResult);

    const records = await getRecords(connection, model);
    return { connection, model, sync, activityLogId, records };
};

const getRecords = async (connection: Connection, model: string) => {
    const { response } = await recordsService.getAllDataRecords(connection.connection_id, connection.provider_config_key, connection.environment_id, model);
    if (response) {
        return response.records;
    }
    throw new Error('cannot fetch records');
};
