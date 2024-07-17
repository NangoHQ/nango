// import { expect, describe, it, beforeAll, afterAll } from 'vitest';
// import db, { multipleMigrations } from '@nangohq/database';
// import type { SyncRunConfig } from './run.service.js';
// import { SyncRunService } from './run.service.js';
// import { SyncStatus, SyncType } from '../../models/Sync.js';
// import * as jobService from './job.service.js';
// import type { IntegrationServiceInterface, Sync, Job as SyncJob, SyncResult } from '../../models/Sync.js';
// import type { Connection } from '../../models/Connection.js';
// import type { SendSyncParams } from '@nangohq/webhooks';
// import type { LogContext } from '@nangohq/logs';
// import { envs, logContextGetter } from '@nangohq/logs';
// import type { UnencryptedRecordData, ReturnedRecord } from '@nangohq/records';
// import { records as recordsService, format as recordsFormatter, migrate as migrateRecords, clearDbTestsOnly as clearRecordsDb } from '@nangohq/records';
// import { createEnvironmentSeed } from '../../seeders/environment.seeder.js';
// import { createConnectionSeeds } from '../../seeders/connection.seeder.js';
// import { createSyncSeeds } from '../../seeders/sync.seeder.js';
// import { createSyncJobSeeds } from '../../seeders/sync-job.seeder.js';
// import connectionService from '../connection.service.js';
// import { SlackService } from '../notification/slack.service.js';
//
// class integrationServiceMock implements IntegrationServiceInterface {
//     async runScript() {
//         return Promise.resolve({
//             success: true
//         });
//     }
//     async cancelScript() {
//         return Promise.resolve();
//     }
// }
//
// const orchestratorClient = {
//     recurring: () => Promise.resolve({}) as any,
//     executeAction: () => Promise.resolve({}) as any,
//     executeWebhook: () => Promise.resolve({}) as any,
//     executePostConnection: () => Promise.resolve({}) as any,
//     executeSync: () => Promise.resolve({}) as any,
//     cancel: () => Promise.resolve({}) as any,
//     pauseSync: () => Promise.resolve({}) as any,
//     unpauseSync: () => Promise.resolve({}) as any,
//     deleteSync: () => Promise.resolve({}) as any,
//     updateSyncFrequency: () => Promise.resolve({}) as any,
//     searchSchedules: () => Promise.resolve({}) as any
// };
// const slackService = new SlackService({ orchestratorClient, logContextGetter });
//
// const integrationService = new integrationServiceMock();
//
// const sendSyncWebhookMock = async (_params: SendSyncParams) => {
//     return Promise.resolve();
// };
//
// describe('Running sync', () => {
//     beforeAll(async () => {
//         await initDb();
//         envs.NANGO_LOGS_ENABLED = false;
//     });
//
//     afterAll(async () => {
//         await clearDb();
//         await clearRecordsDb();
//     });
//
//     describe(`with track_deletes=false`, () => {
//         const trackDeletes = false;
//         it(`should report no records have changed`, async () => {
//             const rawRecords = [
//                 { id: '1', name: 'a' },
//                 { id: '2', name: 'b' }
//             ];
//             const expectedResult = { added: 0, updated: 0, deleted: 0 };
//             const { records } = await verifySyncRun(rawRecords, rawRecords, trackDeletes, expectedResult);
//             records.forEach((record) => {
//                 expect(record._nango_metadata.first_seen_at).toEqual(record._nango_metadata.last_modified_at);
//                 expect(record._nango_metadata.deleted_at).toBeNull();
//                 expect(record._nango_metadata.last_action).toEqual('ADDED');
//             });
//         });
//
//         it(`should report one record has been added and one modified`, async () => {
//             const rawRecords = [
//                 { id: '1', name: 'a' },
//                 { id: '2', name: 'b' }
//             ];
//             const newRecords = [
//                 { id: '1', name: 'A' },
//                 { id: '3', name: 'c' }
//             ];
//             const expectedResult = { added: 1, updated: 1, deleted: 0 };
//             const { records } = await verifySyncRun(rawRecords, newRecords, trackDeletes, expectedResult);
//
//             const record1 = records.find((record) => record.id == '1');
//             if (!record1) throw new Error('record1 is not defined');
//             expect(record1['name']).toEqual('A');
//             expect(record1._nango_metadata.first_seen_at < record1._nango_metadata.last_modified_at).toBeTruthy();
//             expect(record1._nango_metadata.deleted_at).toBeNull();
//             expect(record1._nango_metadata.last_action).toEqual('UPDATED');
//
//             const record2 = records.find((record) => record.id == '2');
//             if (!record2) throw new Error('record2 is not defined');
//             expect(record2._nango_metadata.first_seen_at).toEqual(record2._nango_metadata.last_modified_at);
//             expect(record2._nango_metadata.last_action).toEqual('ADDED'); // record was added as part of the initial save
//             const record3 = records.find((record) => record.id == '3');
//             if (!record3) throw new Error('record3 is not defined');
//             expect(record3._nango_metadata.first_seen_at).toEqual(record3._nango_metadata.last_modified_at);
//             expect(record3._nango_metadata.last_action).toEqual('ADDED');
//         });
//     });
//
//     describe(`with track_deletes=true`, () => {
//         const trackDeletes = true;
//         it(`should report no records have changed`, async () => {
//             const rawRecords = [
//                 { id: '1', name: 'a' },
//                 { id: '2', name: 'b' }
//             ];
//             const expectedResult = { added: 0, updated: 0, deleted: 0 };
//             const { records } = await verifySyncRun(rawRecords, rawRecords, trackDeletes, expectedResult);
//             expect(records).lengthOf(2);
//             records.forEach((record) => {
//                 expect(record._nango_metadata.first_seen_at).toEqual(record._nango_metadata.last_modified_at);
//                 expect(record._nango_metadata.deleted_at).toBeNull();
//                 expect(record._nango_metadata.last_action).toEqual('ADDED');
//             });
//         });
//
//         it(`should report one record has been added, one updated and one deleted`, async () => {
//             const rawRecords = [
//                 { id: '1', name: 'a' },
//                 { id: '2', name: 'b' }
//             ];
//             const newRecords = [
//                 { id: '1', name: 'A' },
//                 { id: '3', name: 'c' }
//             ];
//             const expectedResult = { added: 1, updated: 1, deleted: 1 };
//             const { records } = await verifySyncRun(rawRecords, newRecords, trackDeletes, expectedResult);
//             const record1 = records.find((record) => record.id == '1');
//             if (!record1) throw new Error('record1 is not defined');
//             expect(record1['name']).toEqual('A');
//             expect(record1._nango_metadata.first_seen_at < record1._nango_metadata.last_modified_at).toBeTruthy();
//             expect(record1._nango_metadata.deleted_at).toBeNull();
//             expect(record1._nango_metadata.last_action).toEqual('UPDATED');
//             const record2 = records.find((record) => record.id == '2');
//             if (!record2) throw new Error('record2 is not defined');
//             expect(record2._nango_metadata.first_seen_at < record2._nango_metadata.last_modified_at).toBeTruthy();
//             expect(record2._nango_metadata.deleted_at).not.toBeNull();
//             expect(record2._nango_metadata.last_action).toEqual('DELETED');
//             const record3 = records.find((record) => record.id == '3');
//             if (!record3) throw new Error('record3 is not defined');
//             expect(record3._nango_metadata.first_seen_at).toEqual(record3._nango_metadata.last_modified_at);
//             expect(record3._nango_metadata.last_action).toEqual('ADDED');
//         });
//
//         it(`should undelete record`, async () => {
//             const initialRecords = [
//                 { id: '1', name: 'a' },
//                 { id: '2', name: 'b' }
//             ];
//             const expectedResult = { added: 0, updated: 0, deleted: 0 };
//             const { connection, sync, model, logCtx } = await verifySyncRun(initialRecords, initialRecords, false, expectedResult);
//
//             // records '2' is going to be deleted
//             const newRecords = [{ id: '1', name: 'a' }];
//             await runJob(newRecords, logCtx, model, connection, sync, trackDeletes, false);
//
//             const records = await getRecords(connection, model);
//             const record = records.find((record) => record.id == '2');
//             if (!record) throw new Error('record is not defined');
//             expect(record._nango_metadata.first_seen_at < record._nango_metadata.last_modified_at).toBeTruthy();
//             expect(record._nango_metadata.deleted_at).not.toBeNull();
//             expect(record._nango_metadata.last_action).toEqual('DELETED');
//
//             // records '2' should be back
//             const result = await runJob(initialRecords, logCtx, model, connection, sync, trackDeletes, false);
//             expect(result).toEqual({ added: 1, updated: 0, deleted: 0 });
//
//             const recordsAfter = await getRecords(connection, model);
//             const recordAfter = recordsAfter.find((record) => record.id == '2');
//             if (!recordAfter) throw new Error('record is not defined');
//             expect(recordAfter._nango_metadata.first_seen_at).toEqual(recordAfter._nango_metadata.last_modified_at);
//             expect(recordAfter._nango_metadata.deleted_at).toBeNull();
//             expect(recordAfter._nango_metadata.last_action).toEqual('ADDED');
//         });
//     });
//
//     describe(`with softDelete=true`, () => {
//         const softDelete = true;
//         it(`should report records have been deleted`, async () => {
//             const rawRecords = [
//                 { id: '1', name: 'a' },
//                 { id: '2', name: 'b' }
//             ];
//             const expectedResult = { added: 0, updated: 0, deleted: 2 };
//             const { records } = await verifySyncRun(rawRecords, rawRecords, false, expectedResult, softDelete);
//             expect(records).lengthOf(2);
//             records.forEach((record) => {
//                 expect(record._nango_metadata.deleted_at).toEqual(record._nango_metadata.last_modified_at);
//                 expect(record._nango_metadata.deleted_at).not.toBeNull();
//                 expect(record._nango_metadata.last_action).toEqual('DELETED');
//             });
//         });
//     });
// });
//
// const initDb = async () => {
//     await multipleMigrations();
//     await migrateRecords();
// };
//
// const clearDb = async () => {
//     await db.knex.raw(`DROP SCHEMA nango CASCADE`);
// };
//
// const runJob = async (
//     rawRecords: UnencryptedRecordData[],
//     logCtx: LogContext,
//     model: string,
//     connection: Connection,
//     sync: Sync,
//     trackDeletes: boolean,
//     softDelete: boolean
// ): Promise<SyncResult> => {
//     // create new sync job
//     const syncJob = (await jobService.createSyncJob(sync.id, SyncType.INCREMENTAL, SyncStatus.RUNNING, 'test-job-id', connection)) as SyncJob;
//     if (!syncJob) {
//         throw new Error('Fail to create sync job');
//     }
//
//     const config: SyncRunConfig = {
//         integrationService: integrationService,
//         recordsService,
//         slackService,
//         writeToDb: true,
//         nangoConnection: connection,
//         syncConfig: {
//             id: 0,
//             sync_name: sync.name,
//             file_location: '',
//             models: [model],
//             track_deletes: trackDeletes,
//             type: 'sync',
//             attributes: {},
//             is_public: false,
//             version: '0',
//             active: true,
//             auto_start: false,
//             enabled: true,
//             environment_id: 1,
//             model_schema: [],
//             nango_config_id: 1,
//             runs: '',
//             webhook_subscriptions: [],
//             created_at: new Date(),
//             updated_at: new Date()
//         },
//         sendSyncWebhook: sendSyncWebhookMock,
//         syncType: SyncType.FULL,
//         syncId: sync.id,
//         syncJobId: syncJob.id,
//         activityLogId: logCtx.id,
//         logCtx: logCtx,
//         runnerFlags: {} as any
//     };
//     const syncRun = new SyncRunService(config);
//
//     // format and upsert records
//     const formatting = recordsFormatter.formatRecords({
//         data: rawRecords,
//         connectionId: connection.id as number,
//         model,
//         syncId: sync.id,
//         syncJobId: syncJob.id,
//         softDelete
//     });
//     if (formatting.isErr()) {
//         throw new Error(`failed to format records`);
//     }
//     const upserting = await recordsService.upsert({ records: formatting.value, connectionId: connection.id as number, model, softDelete });
//     if (upserting.isErr()) {
//         throw new Error(`failed to upsert records: ${upserting.error.message}`);
//     }
//     const summary = upserting.value;
//     const updatedResults = {
//         [model]: {
//             added: summary.addedKeys.length,
//             updated: summary.updatedKeys.length,
//             deleted: summary.deletedKeys?.length || 0
//         }
//     };
//     await jobService.updateSyncJobResult(syncJob.id, updatedResults, model);
//     // finish the sync
//     await syncRun.finishFlow(new Date(), 10);
//
//     const syncJobResult = await jobService.getLatestSyncJob(sync.id);
//     return {
//         added: syncJobResult?.result?.[model]?.added || 0,
//         updated: syncJobResult?.result?.[model]?.updated || 0,
//         deleted: syncJobResult?.result?.[model]?.deleted || 0
//     };
// };
//
// const verifySyncRun = async (
//     initialRecords: UnencryptedRecordData[],
//     newRecords: UnencryptedRecordData[],
//     trackDeletes: boolean,
//     expectedResult: SyncResult,
//     softDelete: boolean = false
// ): Promise<{ connection: Connection; model: string; sync: Sync; logCtx: LogContext; records: ReturnedRecord[] }> => {
//     // Write initial records
//     const { connection, model, sync, logCtx } = await populateRecords(initialRecords);
//
//     // Run job to save new records
//     const result = await runJob(newRecords, logCtx, model, connection, sync, trackDeletes, softDelete);
//
//     expect(result).toEqual(expectedResult);
//
//     const records = await getRecords(connection, model);
//     return { connection, model, sync, logCtx, records };
// };
//
// const getRecords = async (connection: Connection, model: string) => {
//     const res = await recordsService.getRecords({ connectionId: connection.id!, model });
//     if (res.isOk()) {
//         return res.value.records;
//     }
//     throw new Error('cannot fetch records');
// };
//
// async function populateRecords(toInsert: UnencryptedRecordData[]): Promise<{
//     connection: Connection;
//     model: string;
//     sync: Sync;
//     syncJob: SyncJob;
//     logCtx: LogContext;
// }> {
//     const {
//         records,
//         meta: { env, model, connectionId, sync, syncJob }
//     } = await mockRecords(toInsert);
//     const connection = await connectionService.getConnectionById(connectionId);
//
//     if (!connection) {
//         throw new Error(`Connection '${connectionId}' not found`);
//     }
//
//     const logCtx = await logContextGetter.create(
//         { operation: { type: 'sync', action: 'init' }, message: 'test' },
//         { account: { id: 1, name: '' }, environment: { id: env.id, name: 'dev' } },
//         { dryRun: true, logToConsole: false }
//     );
//     const chunkSize = 1000;
//     for (let i = 0; i < records.length; i += chunkSize) {
//         const res = await recordsService.upsert({ records: records.slice(i, i + chunkSize), connectionId, model });
//         if (res.isErr()) {
//             throw new Error(`Failed to upsert records: ${res.error.message}`);
//         }
//     }
//     return {
//         connection: connection as Connection,
//         model,
//         sync,
//         syncJob,
//         logCtx
//     };
// }
//
// async function mockRecords(records: UnencryptedRecordData[]) {
//     const envName = Math.random().toString(36).substring(7);
//     const env = await createEnvironmentSeed(0, envName);
//
//     const connections = await createConnectionSeeds(env);
//
//     const [connectionId]: number[] = connections;
//     if (!connectionId) {
//         throw new Error('Failed to create connection');
//     }
//     const sync = await createSyncSeeds(connectionId);
//     if (!sync.id) {
//         throw new Error('Failed to create sync');
//     }
//     const job = await createSyncJobSeeds(sync.id);
//     if (!job.id) {
//         throw new Error('Failed to create job');
//     }
//     const model = Math.random().toString(36).substring(7);
//     const formattedRecords = recordsFormatter.formatRecords({ data: records, connectionId, model, syncId: sync.id, syncJobId: job.id });
//
//     if (formattedRecords.isErr()) {
//         throw new Error(`Failed to format records: ${formattedRecords.error.message}`);
//     }
//
//     return {
//         meta: {
//             env,
//             connectionId,
//             model,
//             sync,
//             syncJob: job
//         },
//         records: formattedRecords.value
//     };
// }
