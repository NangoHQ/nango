import { createConnectionSeeds } from '../../../db/seeders/connection.seeder.js';
import { createSyncSeeds } from '../../../db/seeders/sync.seeder.js';
import { createEnvironmentSeed } from '../../../db/seeders/environment.seeder.js';
import { createSyncJobSeeds } from '../../../db/seeders/sync-job.seeder.js';
import { formatDataRecords } from './records.service.js';
import type { DataResponse } from '../../../models/Data.js';
import connectionService from '../../connection.service.js';
import * as DataService from './data.service.js';
import type { Connection } from '../../../models/Connection.js';
import type { Sync, Job as SyncJob } from '../../../models/Sync.js';
import { createActivityLog } from '../../activity/activity.service.js';
import type { Environment } from '../../../models/Environment.js';
import { LogContext } from '@nangohq/logs';

export async function upsertNRecords(n: number): Promise<{
    env: Environment;
    connection: Connection;
    model: string;
    sync: Sync;
    syncJob: SyncJob;
    activityLogId: number;
}> {
    const mockRecords = generateInsertableJson(n);
    return upsertRecords(mockRecords);
}

export async function upsertRecords(toInsert: DataResponse[]): Promise<{
    env: Environment;
    connection: Connection;
    model: string;
    sync: Sync;
    syncJob: SyncJob;
    activityLogId: number;
}> {
    const {
        response: { response: records },
        meta: { env, modelName, nangoConnectionId, sync, syncJob }
    } = await createRecords(toInsert);
    const connection = await connectionService.getConnectionById(nangoConnectionId);

    if (!records) {
        throw new Error('Failed to format records');
    }
    if (!connection) {
        throw new Error(`Connection '${nangoConnectionId}' not found`);
    }
    const activityLogId = await createActivityLog({
        level: 'info',
        success: false,
        environment_id: env.id,
        action: 'sync',
        start: Date.now(),
        end: Date.now(),
        timestamp: Date.now(),
        connection_id: connection.connection_id,
        provider: connection?.provider_config_key,
        provider_config_key: connection.provider_config_key
    });
    if (!activityLogId) {
        throw new Error('Failed to create activity log');
    }
    const chunkSize = 1000;

    const logCtx = new LogContext({ parentId: String(activityLogId) }, { dryRun: true, logToConsole: false });
    for (let i = 0; i < records.length; i += chunkSize) {
        const { error, success } = await DataService.upsert(
            records.slice(i, i + chunkSize),
            nangoConnectionId,
            modelName,
            activityLogId,
            env.id,
            undefined,
            logCtx
        );
        if (!success) {
            throw new Error(`Failed to upsert records: ${error}`);
        }
    }
    return {
        env,
        connection: connection as Connection,
        model: modelName,
        sync,
        syncJob,
        activityLogId
    };
}

export async function createRecords(records: DataResponse[]) {
    const envName = Math.random().toString(36).substring(7);
    const env = await createEnvironmentSeed(envName);

    const connections = await createConnectionSeeds(env);

    const [nangoConnectionId]: number[] = connections;
    if (!nangoConnectionId) {
        throw new Error('Failed to create connection');
    }
    const sync = await createSyncSeeds(nangoConnectionId);
    if (!sync.id) {
        throw new Error('Failed to create sync');
    }
    const job = await createSyncJobSeeds(sync.id);
    if (!job.id) {
        throw new Error('Failed to create job');
    }
    const modelName = Math.random().toString(36).substring(7);
    const response = formatDataRecords(records, nangoConnectionId, modelName, sync.id, job.id);

    return {
        meta: {
            env,
            nangoConnectionId,
            modelName,
            sync,
            syncJob: job
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
