import { getById as getSyncById } from '../services/sync/sync.service.js';
import { upsert } from '../services/sync/data.service.js';
import { formatDataRecords } from '../services/sync/data-records.service.js';
import { createActivityLogMessage } from '../services/activity.service.js';
import { updateSyncJobResult } from '../services/sync/job.service.js';

import type { UpsertResponse } from '../models/Data.js';
import type { ProxyConfiguration } from '../models/Proxy.js';
import type { LogLevel } from '../models/Activity.js';
import type { SyncResult } from '../models/Sync.js';

import { Nango } from './index.js';

interface NangoProps {
    host?: string;
    secretKey?: string;
    connectionId?: string;
    activityLogId?: number;
    providerConfigKey?: string;
    lastSyncDate?: Date;
    syncId?: string | undefined;
    nangoConnectionId?: number;
    syncJobId?: number | undefined;
    dryRun?: boolean;
}

interface UserLogParameters {
    success?: boolean;
    level?: LogLevel;
}

export class NangoSync {
    private nango: Nango;
    activityLogId?: number;
    lastSyncDate?: Date;
    syncId?: string;
    nangoConnectionId?: number;
    syncJobId?: number;
    dryRun?: boolean;

    public connectionId?: string;
    public providerConfigKey?: string;

    constructor(config: NangoProps = {}) {
        if (config.activityLogId) {
            this.activityLogId = config.activityLogId;
        }

        this.nango = new Nango({
            isSync: true,
            ...config
        });

        if (config.syncId) {
            this.syncId = config.syncId;
        }

        if (config.nangoConnectionId) {
            this.nangoConnectionId = config.nangoConnectionId;
        }

        if (config.syncJobId) {
            this.syncJobId = config.syncJobId;
        }

        if (config.dryRun) {
            this.dryRun = config.dryRun;
        }

        if (config.connectionId) {
            this.connectionId = config.connectionId;
        }

        if (config.providerConfigKey) {
            this.providerConfigKey = config.providerConfigKey;
        }
    }

    public setLastSyncDate(date: Date) {
        this.lastSyncDate = date;
    }

    public async proxy(config: ProxyConfiguration) {
        return this.nango.proxy(config);
    }

    public async setFieldMapping(fieldMapping: Record<string, string>, optionalProviderConfigKey?: string, optionalConnectionId?: string) {
        return this.nango.setFieldMapping(fieldMapping, optionalProviderConfigKey, optionalConnectionId);
    }

    public async getFieldMapping(optionalProviderConfigKey?: string, optionalConnectionId?: string) {
        return this.nango.getFieldMapping(optionalProviderConfigKey, optionalConnectionId);
    }

    public async get(config: ProxyConfiguration) {
        return this.proxy({
            ...config,
            method: 'GET'
        });
    }

    public async post(config: ProxyConfiguration) {
        return this.proxy({
            ...config,
            method: 'POST'
        });
    }

    public async patch(config: ProxyConfiguration) {
        return this.proxy({
            ...config,
            method: 'PATCH'
        });
    }

    public async delete(config: ProxyConfiguration) {
        return this.proxy({
            ...config,
            method: 'DELETE'
        });
    }

    public async batchSend(results: any[], model: string): Promise<UpsertResponse | null> {
        if (this.dryRun) {
            console.log('A batch send call would send the following data:');
            console.log(JSON.stringify(results, null, 2));
            return null;
        }

        if (!this.nangoConnectionId || !this.syncId || !this.activityLogId || !this.syncJobId) {
            throw new Error('Nango Connection Id, Sync Id, Activity Log Id and Sync Job Id are all required');
        }

        const formattedResults = formatDataRecords(results, this.nangoConnectionId as number, model, this.syncId as string, this.syncJobId);

        const fullSync = await getSyncById(this.syncId as string);

        if (fullSync && !fullSync?.models.includes(model)) {
            throw new Error(`The model: ${model} is not included in the declared sync models: ${fullSync.models}.`);
        }

        const responseResults = await upsert(
            formattedResults,
            '_nango_sync_data_records',
            'external_id',
            this.nangoConnectionId as number,
            model,
            this.activityLogId as number
        );

        if (responseResults.success) {
            const { summary } = responseResults;
            const updatedResults = { added: summary?.addedKeys.length, updated: summary?.updatedKeys.length };

            await createActivityLogMessage({
                level: 'info',
                activity_log_id: this.activityLogId as number,
                content: `Batch send was a success and resulted in ${JSON.stringify(updatedResults, null, 2)}`,
                timestamp: Date.now()
            });

            await updateSyncJobResult(this.syncJobId as number, updatedResults as SyncResult);

            return responseResults;
        } else {
            await createActivityLogMessage({
                level: 'error',
                activity_log_id: this.activityLogId as number,
                content: `There was an issue with the batch send. ${responseResults?.error}`,
                timestamp: Date.now()
            });

            return null;
        }
    }

    public async log(content: string, userDefinedLevel?: UserLogParameters): Promise<void> {
        if (this.dryRun) {
            console.log(content);
            return;
        }

        if (!this.activityLogId) {
            throw new Error('There is no current activity log stream to log to');
        }

        await createActivityLogMessage({
            level: userDefinedLevel?.level ?? 'info',
            activity_log_id: this.activityLogId as number,
            content,
            timestamp: Date.now()
        });
    }
}
