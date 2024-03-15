import { expect, describe, it, beforeAll } from 'vitest';
import { multipleMigrations } from '../../../db/database.js';
import type { DataResponse } from '../../../models/Data.js';
import * as DataService from './data.service.js';
import connectionService from '../../connection.service.js';
import { clearOldRecords, getFullRecords, getFullSnapshotRecords, takeSnapshot, getDeletedKeys } from './delete.service.js';
import { getAllDataRecords, formatDataRecords } from './records.service.js';
import { createConfigSeeds } from '../../../db/seeders/config.seeder.js';
import type { DataRecord } from '../../../models/Sync.js';
import { generateInsertableJson, createRecords } from './mocks.js';
import { createActivityLog } from '../../activity/activity.service.js';
import type { Environment } from '../../../models/Environment.js';

const environmentName = 'delete-service';

async function getActivity(env: Environment): Promise<number> {
    const activityLogId = await createActivityLog({
        action: 'full sync',
        connection_id: '1234',
        environment_id: env.id,
        level: 'debug',
        provider_config_key: 'test',
        start: Date.now(),
        success: false,
        timestamp: Date.now()
    });
    if (!activityLogId) {
        throw new Error('failed_to_create_activitylogid');
    }

    return activityLogId;
}

describe('Data delete service integration tests', () => {
    let envs: Environment[];
    beforeAll(async () => {
        await multipleMigrations();
        envs = await createConfigSeeds(environmentName);
    });

    it('Should insert records properly and retrieve a full record', async () => {
        const env = envs[0]!;
        const activityLogId = await getActivity(env);

        const duplicateRecords = [
            {
                id: '1',
                name: 'John Doe'
            },
            {
                id: '1',
                name: 'John Doe'
            },
            {
                id: '2',
                name: 'Jane Doe'
            },
            {
                id: '2',
                name: 'Jane Doe'
            },
            {
                id: '3',
                name: 'John Doe'
            },
            {
                id: '3',
                name: 'John Doe'
            },
            { id: '4', name: 'Mike Doe' },
            { id: '5', name: 'Mike Doe' }
        ];
        const { meta, response } = await createRecords(duplicateRecords, environmentName);
        const { response: formattedResults } = response;
        const { nangoConnectionId, modelName, syncId, syncJobId } = meta;
        const { error, success } = await DataService.upsert(
            formattedResults as unknown as DataRecord[],
            '_nango_sync_data_records',
            'external_id',
            nangoConnectionId,
            modelName,
            activityLogId,
            env.id
        );
        expect(success).toBe(true);
        expect(error).toBe(undefined);

        const fullRecords = await getFullRecords(nangoConnectionId, modelName);

        for (const record of fullRecords) {
            expect(record).toHaveProperty('id');
            expect(record).toHaveProperty('external_id');
            expect(record).toHaveProperty('json');
            expect(record).toHaveProperty('data_hash');
            expect(record).toHaveProperty('nango_connection_id');
            expect(record).toHaveProperty('model');
            expect(record).toHaveProperty('created_at');
            expect(record).toHaveProperty('updated_at');
            expect(record).toHaveProperty('sync_id');
            expect(record).toHaveProperty('sync_job_id');
            expect(record).toHaveProperty('external_is_deleted');
            expect(record).toHaveProperty('external_deleted_at');

            expect(record.nango_connection_id).toBe(nangoConnectionId);
            expect(record.sync_id).toBe(syncId);
            expect(record.sync_job_id).toBe(syncJobId);
            expect(record.model).toBe(modelName);
        }
    });

    it('Should take a snapshot of the inserted records', async () => {
        const env = envs[0]!;
        const activityLogId = await getActivity(env);
        const records = generateInsertableJson(100);
        const { response, meta } = await createRecords(records, environmentName);
        const { response: formattedResults } = response;
        const { modelName, nangoConnectionId } = meta;
        const { error, success } = await DataService.upsert(
            formattedResults as unknown as DataRecord[],
            '_nango_sync_data_records',
            'external_id',
            nangoConnectionId,
            modelName,
            activityLogId,
            env.id
        );
        expect(success).toBe(true);
        expect(error).toBe(undefined);
        await takeSnapshot(meta.nangoConnectionId, meta.modelName);
        const fullRecords = await getFullRecords(nangoConnectionId, modelName);
        const fullRecordsWithoutPendingDelete = fullRecords.map((record: any) => {
            const { pending_delete, ...rest } = record;
            return rest;
        });
        const snapshotFullRecords = await getFullSnapshotRecords(nangoConnectionId, modelName);
        expect(fullRecordsWithoutPendingDelete).toMatchObject(snapshotFullRecords);
    });

    it('Given a snapshot, the next insert with less records should show as deleted if track deletes is true', async () => {
        const env = envs[0]!;
        const activityLogId = await getActivity(env);
        const records = generateInsertableJson(100);
        const { response, meta } = await createRecords(records, environmentName);
        const { response: formattedResults } = response;
        const { modelName, nangoConnectionId } = meta;
        const { error, success } = await DataService.upsert(
            formattedResults as unknown as DataRecord[],
            '_nango_sync_data_records',
            'external_id',
            nangoConnectionId,
            modelName,
            activityLogId,
            env.id,
            true // track_deletes
        );
        expect(success).toBe(true);
        expect(error).toBe(undefined);
        await takeSnapshot(nangoConnectionId, modelName);

        const slimmerResults = formattedResults?.slice(0, 80);

        const { error: slimError, success: slimSuccess } = await DataService.upsert(
            slimmerResults as DataRecord[],
            '_nango_sync_data_records',
            'external_id',
            nangoConnectionId,
            modelName,
            activityLogId,
            env.id,
            true // track_deletes
        );
        expect(slimSuccess).toBe(true);
        expect(slimError).toBe(undefined);

        await clearOldRecords(nangoConnectionId, modelName);
        const deletedKeys = await getDeletedKeys('_nango_sync_data_records', 'external_id', nangoConnectionId, modelName);
        expect(deletedKeys?.length).toEqual(20);

        const connection = await connectionService.getConnectionById(nangoConnectionId);

        const { response: recordResponse } = await getAllDataRecords(
            connection?.connection_id as string,
            connection?.provider_config_key as string,
            connection?.environment_id as number,
            modelName,
            undefined, // delta
            undefined, // limit
            'deleted'
        );

        expect(recordResponse?.records?.length).toEqual(20);
    });

    it('Given a snapshot, the next insert with less records should not show as deleted if track deletes is false', async () => {
        const env = envs[0]!;
        const activityLogId = await getActivity(env);
        const records = generateInsertableJson(100);
        const { response, meta } = await createRecords(records, environmentName);
        const { response: formattedResults } = response;
        const { modelName, nangoConnectionId } = meta;
        const { error, success } = await DataService.upsert(
            formattedResults as unknown as DataRecord[],
            '_nango_sync_data_records',
            'external_id',
            nangoConnectionId,
            modelName,
            activityLogId,
            env.id,
            false // track_deletes
        );
        expect(success).toBe(true);
        expect(error).toBe(undefined);
        await takeSnapshot(nangoConnectionId, meta.modelName);

        const slimmerResults = formattedResults?.slice(0, 80);

        const {
            error: slimError,
            success: slimSuccess,
            summary
        } = await DataService.upsert(
            slimmerResults as DataRecord[],
            '_nango_sync_data_records',
            'external_id',
            nangoConnectionId,
            modelName,
            activityLogId,
            env.id,
            false // track_deletes
        );
        expect(slimSuccess).toBe(true);
        expect(slimError).toBe(undefined);

        expect(summary?.deletedKeys?.length).toEqual(0);

        const connection = await connectionService.getConnectionById(nangoConnectionId);

        const { response: recordResponse } = await getAllDataRecords(
            connection?.connection_id as string,
            connection?.provider_config_key as string,
            connection?.environment_id as number,
            modelName,
            undefined, // delta
            undefined, // limit
            'deleted'
        );

        expect(recordResponse?.records?.length).toEqual(0);
    });

    it('When track deletes is true and an entry is updated it only that record should show as updated when getAllDataRecords is called', async () => {
        const env = envs[0]!;
        const activityLogId = await getActivity(env);
        const records = generateInsertableJson(100);
        const { response, meta } = await createRecords(records, environmentName);
        const { response: rawRecords } = response;
        const { modelName, nangoConnectionId, syncId, syncJobId } = meta;
        const { response: formattedResults } = formatDataRecords(
            rawRecords as DataResponse[],
            nangoConnectionId,
            modelName,
            syncId,
            syncJobId,
            new Date(),
            true
        );
        const { error, success } = await DataService.upsert(
            formattedResults as unknown as DataRecord[],
            '_nango_sync_data_records',
            'external_id',
            nangoConnectionId,
            modelName,
            activityLogId,
            env.id,
            true // track_deletes
        );
        expect(success).toBe(true);
        expect(error).toBe(undefined);
        await takeSnapshot(nangoConnectionId, modelName);

        if (formattedResults) {
            // @ts-expect-error untyped rawRecords
            rawRecords[0]!['json']['updatedAt'] = new Date().toISOString();
        }

        const { response: updatedFormattedResults } = formatDataRecords(
            rawRecords as DataResponse[],
            nangoConnectionId,
            modelName,
            syncId,
            syncJobId,
            new Date(),
            true
        );

        const { error: updateError, success: updateSuccess } = await DataService.upsert(
            updatedFormattedResults as DataRecord[],
            '_nango_sync_data_records',
            'external_id',
            nangoConnectionId,
            modelName,
            activityLogId,
            env.id,
            true // track_deletes
        );

        expect(updateSuccess).toBe(true);
        expect(updateError).toBe(undefined);

        const deletedKeys = await getDeletedKeys('_nango_sync_data_records', 'external_id', nangoConnectionId, modelName);
        expect(deletedKeys?.length).toEqual(0);

        const connection = await connectionService.getConnectionById(nangoConnectionId);

        const { response: updatedRecordResponse } = await getAllDataRecords(
            connection?.connection_id as string,
            connection?.provider_config_key as string,
            connection?.environment_id as number,
            modelName,
            undefined, // delta
            undefined, // limit
            'updated'
        );

        expect(updatedRecordResponse?.records?.length).toEqual(1);

        // When track deletes is true and an entry is updated it should show as updated when getAllDataRecords is called
        const { response: addedRecordResponse } = await getAllDataRecords(
            connection?.connection_id as string,
            connection?.provider_config_key as string,
            connection?.environment_id as number,
            modelName,
            undefined, // delta
            undefined, // limit
            'added'
        );

        expect(addedRecordResponse?.records?.length).toEqual(99);
    });
});
