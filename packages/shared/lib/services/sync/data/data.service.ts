import { schema } from '../../../db/database.js';
import { getRecordsByExternalIds, verifyUniqueKeysAreUnique } from './records.service.js';
import { createActivityLogMessage } from '../../activity/activity.service.js';
import type { UpsertResponse } from '../../../models/Data.js';
import type { DataRecord } from '../../../models/Sync.js';
import encryptionManager from '../../../utils/encryption.manager.js';
import { logger } from '../../../index.js';

const RECORD_UNIQUE_KEY = 'external_id';
const RECORDS_TABLE = '_nango_sync_data_records';

/**
 * Upsert
 */
export async function upsert(
    records: DataRecord[],
    nangoConnectionId: number,
    model: string,
    activityLogId: number,
    environment_id: number,
    softDelete = false
): Promise<UpsertResponse> {
    const recordsWithoutDuplicates = await removeDuplicateKey(records, activityLogId, environment_id, model);

    if (!recordsWithoutDuplicates || recordsWithoutDuplicates.length === 0) {
        return {
            success: false,
            error: `There are no records to upsert because there were no records that were not duplicates to insert, but there were ${records.length} records received for the "${model}" model.`
        };
    }

    const addedKeys = await getAddedKeys(recordsWithoutDuplicates, nangoConnectionId, model);
    const updatedKeys = await getUpdatedKeys(recordsWithoutDuplicates, nangoConnectionId, model);

    try {
        const encryptedRecords = encryptionManager.encryptDataRecords(recordsWithoutDuplicates);

        const externalIds = await schema()
            .from<DataRecord>(RECORDS_TABLE)
            .insert(encryptedRecords)
            .onConflict(['nango_connection_id', 'external_id', 'model'])
            .merge()
            .returning('external_id');

        if (softDelete) {
            return {
                success: true,
                summary: {
                    deletedKeys: externalIds.map(({ external_id }) => external_id),
                    addedKeys: [],
                    updatedKeys: []
                }
            };
        }

        return {
            success: true,
            summary: {
                addedKeys,
                updatedKeys,
                deletedKeys: []
            }
        };
    } catch (error: any) {
        let errorMessage = `Failed to upsert records to table ${RECORDS_TABLE}.\n`;
        errorMessage += `Model: ${model}, Unique Key: ${RECORD_UNIQUE_KEY}, Nango Connection ID: ${nangoConnectionId}.\n`;
        errorMessage += `Attempted to insert/update/delete: ${recordsWithoutDuplicates.length} records\n`;

        if (error.code) errorMessage += `Error code: ${error.code}.\n`;

        logger.error(`${errorMessage}${error}`);

        let errorDetail = '';
        switch (error.code) {
            case '22001': {
                errorDetail = "String length exceeds the column's maximum length (string_data_right_truncation)";
                break;
            }
        }
        if (errorDetail) errorMessage += `Info: ${errorDetail}.\n`;

        return {
            success: false,
            error: errorMessage
        };
    }
}

export async function update(
    records: DataRecord[],
    nangoConnectionId: number,
    model: string,
    activityLogId: number,
    environment_id: number
): Promise<UpsertResponse> {
    const recordsWithoutDuplicates = await removeDuplicateKey(records, activityLogId, environment_id, model);

    if (!recordsWithoutDuplicates || recordsWithoutDuplicates.length === 0) {
        return {
            success: false,
            error: `There are no records to upsert because there were no records that were not duplicates to insert, but there were ${records.length} records received for the "${model}" model.`
        };
    }

    const updatedKeys = await getUpdatedKeys(recordsWithoutDuplicates, nangoConnectionId, model);

    try {
        const recordsToUpdate = [];
        const rawOldRecords = await getRecordsByExternalIds(updatedKeys, nangoConnectionId, model);

        for (const rawOldRecord of rawOldRecords) {
            if (!rawOldRecord) {
                continue;
            }

            const { record: oldRecord } = rawOldRecord;

            const record = records.find((record) => record.external_id.toString() === (oldRecord as DataRecord)?.id?.toString());

            const newRecord = {
                ...rawOldRecord,
                json: {
                    ...oldRecord,
                    ...record?.json
                },
                updated_at: new Date()
            };

            delete newRecord.record;

            recordsToUpdate.push(newRecord);
        }

        const encryptedRecords = encryptionManager.encryptDataRecords(recordsToUpdate);

        await schema().from(RECORDS_TABLE).insert(encryptedRecords).onConflict(['nango_connection_id', 'external_id', 'model']).merge();

        return {
            success: true,
            summary: {
                addedKeys: [],
                updatedKeys,
                deletedKeys: []
            }
        };
    } catch (error: any) {
        let errorMessage = `Failed to update records to table ${RECORDS_TABLE}.\n`;
        errorMessage += `Model: ${model}, Unique Key: ${RECORD_UNIQUE_KEY}, Nango Connection ID: ${nangoConnectionId}.\n`;
        errorMessage += `Attempted to update: ${recordsWithoutDuplicates.length} records\n`;

        if ('code' in error) errorMessage += `Error code: ${error.code}.\n`;
        if ('detail' in error) errorMessage += `Detail: ${error.detail}.\n`;

        errorMessage += `Error Message: ${error.message}`;

        return {
            success: false,
            error: errorMessage
        };
    }
}

export async function removeDuplicateKey(response: DataRecord[], activityLogId: number, environment_id: number, model: string): Promise<DataRecord[]> {
    const { nonUniqueKeys } = verifyUniqueKeysAreUnique(response, RECORD_UNIQUE_KEY);

    for (const nonUniqueKey of nonUniqueKeys) {
        await createActivityLogMessage({
            level: 'error',
            environment_id,
            activity_log_id: activityLogId,
            content: `There was a duplicate key found: ${nonUniqueKey}. This record will be ignore in relation to the model ${model}.`,
            timestamp: Date.now()
        });
    }

    const seen = new Set();
    const uniqueResponse = response.filter((item) => {
        const key = item[RECORD_UNIQUE_KEY];
        return seen.has(key) ? false : seen.add(key);
    });

    return uniqueResponse;
}

/**
 * Compute Added Keys
 * @desc for any incoming payload use the provided unique to check against the rows
 * in the database and return the keys that are not in the database
 *
 */
export async function getAddedKeys(response: DataRecord[], nangoConnectionId: number, model: string): Promise<string[]> {
    const keys: string[] = response.map((data: DataRecord) => String(data[RECORD_UNIQUE_KEY]));

    const knownKeys: string[] = (await schema()
        .from(RECORDS_TABLE)
        .where({
            nango_connection_id: nangoConnectionId,
            model,
            external_deleted_at: null
        })
        .whereIn('external_id', keys)
        .pluck('external_id')) as unknown as string[];

    const unknownKeys: string[] = keys?.filter((data: string) => !knownKeys.includes(data));

    return unknownKeys;
}

/**
 * Get Updated Keys
 * @desc generate an array of the keys that exist in the database and also in
 * the incoming payload that will be used to update the database.
 * Compare using the data_hash key
 *
 */
export async function getUpdatedKeys(response: DataRecord[], nangoConnectionId: number, model: string): Promise<string[]> {
    const keys: string[] = response.map((data: DataRecord) => String(data[RECORD_UNIQUE_KEY]));
    const keysWithHash: [string, string][] = response.map((data: DataRecord) => [String(data[RECORD_UNIQUE_KEY]), data['data_hash']]);

    const rowsToUpdate = await schema()
        .from(RECORDS_TABLE)
        .pluck('external_id')
        .where({
            nango_connection_id: nangoConnectionId,
            model
        })
        .whereIn('external_id', keys)
        .whereNotIn(['external_id', 'data_hash'], keysWithHash);

    return rowsToUpdate;
}
