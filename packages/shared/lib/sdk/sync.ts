import _ from 'lodash';

import { upsert } from '../services/sync/data.service.js';
import { formatDataRecords } from '../services/sync/data-records.service.js';
import { createActivityLogMessage } from '../services/activity.service.js';
import { updateSyncJobResult } from '../services/sync/job.service.js';

import type { UpsertResponse, DataResponse } from '../models/Data.js';
import type { ProxyConfiguration } from '../models/Proxy.js';
import type { LogLevel } from '../models/Activity.js';

import { Nango } from './index.js';

interface NangoProps {
    host?: string;
    secretKey?: string;
    connectionId?: string;
    activityLogId?: number;
    providerConfigKey?: string;
    isSync?: boolean;
    lastSyncDate?: Date;
    syncId?: string | undefined;
    nangoConnectionId?: number;
    syncJobId?: number | undefined;
}

interface UserLogParameters {
    success?: boolean;
    level?: LogLevel;
}

export class NangoSync {
    nango: Nango;
    activityLogId?: number;
    lastSyncDate?: Date;
    syncId?: string;
    nangoConnectionId?: number;
    syncJobId?: number;

    private throttledCreateActivityLogMessage;

    constructor(config: NangoProps = {}) {
        this.throttledCreateActivityLogMessage = _.throttle(createActivityLogMessage, 1000);

        if (config.activityLogId) {
            this.activityLogId = config.activityLogId;
        }

        this.nango = new Nango(config);

        if (config.syncId) {
            this.syncId = config.syncId;
        }

        if (config.nangoConnectionId) {
            this.nangoConnectionId = config.nangoConnectionId;
        }

        if (config.syncJobId) {
            this.syncJobId = config.syncJobId;
        }
    }

    public setLastSyncDate(date: Date) {
        this.lastSyncDate = date;
    }

    public async proxy(config: ProxyConfiguration) {
        return this.nango.proxy(config);
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

    public async batchSend(results: DataResponse[], model: string): Promise<UpsertResponse | null> {
        if (!this.nangoConnectionId || !this.syncId || !this.activityLogId || !this.syncJobId) {
            throw new Error('Nango Connection Id, Sync Id, Activity Log Id and Sync Job Id are all required');
        }

        const formattedResults = formatDataRecords(results, this.nangoConnectionId as number, model, this.syncId as string);

        const responseResults = await upsert(
            formattedResults,
            '_nango_sync_data_records',
            'external_id',
            this.nangoConnectionId as number,
            model,
            this.activityLogId as number
        );

        if (responseResults) {
            const updatedResults = { added: responseResults.addedKeys.length, updated: responseResults.updatedKeys.length };

            await createActivityLogMessage({
                level: 'info',
                activity_log_id: this.activityLogId as number,
                content: `Batch send was a success and resulted in ${JSON.stringify(updatedResults, null, 2)}`,
                timestamp: Date.now()
            });

            await updateSyncJobResult(this.syncJobId as number, updatedResults);

            return responseResults;
        } else {
            await createActivityLogMessage({
                level: 'error',
                activity_log_id: this.activityLogId as number,
                content: `There was an issue with the batch send`,
                timestamp: Date.now()
            });

            return null;
        }
    }

    public async log(content: string, userDefinedLevel?: UserLogParameters): Promise<void> {
        if (!this.activityLogId) {
            throw new Error('There is no current activity log stream to log to');
        }

        await this.throttledCreateActivityLogMessage({
            level: userDefinedLevel?.level ?? 'info',
            activity_log_id: this.activityLogId as number,
            content,
            timestamp: Date.now()
        });
    }
}
