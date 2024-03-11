import { createConnectionSeeds } from '../../../db/seeders/connection.seeder.js';
import { createSyncSeeds } from '../../../db/seeders/sync.seeder.js';
import { createSyncJobSeeds } from '../../../db/seeders/sync-job.seeder.js';
import { formatDataRecords } from './records.service.js';
import type { DataResponse } from '../../../models/Data.js';
import connectionService from '../../connection.service.js';
import * as DataService from './data.service.js';
import type { Connection } from '../../../models/Connection.js';

export async function upsertRecords(n: number): Promise<{ connection: Connection; model: string }> {
    const activityLogId = 1;
    const environmentId = 1;
    const environmentName = 'mock-records';
    const toInsert = generateInsertableJson(n);
    const {
        response: { response: records },
        meta: { modelName, nangoConnectionId }
    } = await createRecords(toInsert, environmentName);
    if (!records) {
        throw new Error('Failed to format records');
    }
    const connection = await connectionService.getConnectionById(nangoConnectionId);
    if (!connection) {
        throw new Error(`Connection '${nangoConnectionId}' not found`);
    }
    const chunkSize = 1000;
    for (let i = 0; i < records.length; i += chunkSize) {
        const { error, success } = await DataService.upsert(
            records.slice(i, i + chunkSize),
            '_nango_sync_data_records',
            'external_id',
            nangoConnectionId,
            modelName,
            activityLogId,
            environmentId
        );
        if (!success) {
            throw new Error(`Failed to upsert records: ${error}`);
        }
    }
    return {
        connection: connection as Connection,
        model: modelName
    };
}

export async function createRecords(records: DataResponse[], environmentName = '') {
    const connections = await createConnectionSeeds(environmentName);

    const [nangoConnectionId]: number[] = connections;
    if (!nangoConnectionId) {
        throw new Error('Failed to create connection');
    }
    const sync = await createSyncSeeds(nangoConnectionId);
    if (!sync.id) {
        throw new Error('Failed to create sync');
    }
    const job = await createSyncJobSeeds(nangoConnectionId);
    if (!job.id) {
        throw new Error('Failed to create job');
    }
    const modelName = Math.random().toString(36).substring(7);
    const response = formatDataRecords(records, nangoConnectionId, modelName, sync.id, job.id);

    return {
        meta: {
            nangoConnectionId,
            modelName,
            syncId: sync.id,
            syncJobId: job.id
        },
        response
    };
}

export function generateInsertableJson(num: number) {
    const records = [];
    for (let i = 0; i < num; i++) {
        records.push({
            id: i.toString(),
            name: Math.random().toString(36).substring(7),
            email: Math.random().toString(36).substring(7),
            phone: Math.random().toString(36).substring(7),
            address: Math.random().toString(36).substring(7),
            city: Math.random().toString(36).substring(7),
            state: Math.random().toString(36).substring(7),
            zip: Math.random().toString(36).substring(7),
            country: Math.random().toString(36).substring(7),
            company: Math.random().toString(36).substring(7),
            jobTitle: Math.random().toString(36).substring(7),
            website: Math.random().toString(36).substring(7),
            externalCreatedAt: Math.random().toString(36).substring(7),
            updatedAt: Math.random().toString(36).substring(7),
            externalUpdatedAt: Math.random().toString(36).substring(7)
        });
    }

    return records;
}
