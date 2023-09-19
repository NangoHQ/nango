import { createConnectionSeeds } from '../../../db/seeders/connection.seeder.js';
import { createSyncSeeds } from '../../../db/seeders/sync.seeder.js';
import { createSyncJobSeeds } from '../../../db/seeders/sync-job.seeder.js';
import { formatDataRecords } from './records.service.js';
import type { DataResponse } from '../../../models/Data.js';

export async function createRecords(records: DataResponse[], environmentName = '') {
    const connections = await createConnectionSeeds(environmentName);

    const [nangoConnectionId]: number[] = connections;
    const sync = await createSyncSeeds(nangoConnectionId);
    const job = await createSyncJobSeeds(nangoConnectionId);
    const modelName = Math.random().toString(36).substring(7);
    const response = formatDataRecords(records, nangoConnectionId as number, modelName, sync.id as string, job.id as number);

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
            externalUpdatedAt: Math.random().toString(36).substring(7)
        });
    }

    return records;
}
