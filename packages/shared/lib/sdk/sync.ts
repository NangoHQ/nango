//import _ from 'lodash';

import { upsert } from '../services/sync/data.service.js';
import { formatDataRecords } from '../services/sync/data-records.service.js';
import { createActivityLogMessage } from '../services/activity.service.js';
import { updateSyncJobResult } from '../services/sync/job.service.js';

import type { UpsertResponse } from '../models/Data.js';
import type { ProxyConfiguration } from '../models/Proxy.js';
import type { LogLevel } from '../models/Activity.js';
import type { SyncResult } from '../models/Sync.js';

import { Nango } from './index.js';

//const THROTTLE_TIME = 100;

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

    //private throttledCreateActivityLogMessage;

    constructor(config: NangoProps = {}) {
        //this.throttledCreateActivityLogMessage = _.throttle(createActivityLogMessage, THROTTLE_TIME);

        /*
        this.throttledCreateActivityLogMessage = _.throttle(() => {
            if (isThrottled) {
                console.log("Throttled createActivityLogMessage called");
            } else {
                createActivityLogMessage();
                isThrottled = true;
                setTimeout(() => {
                    isThrottled = false;
                }, throttleDuration);
            }
        }, throttleDuration);
        */

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

        if (config.dryRun) {
            this.dryRun = config.dryRun;
        }

        /**
        const isThrottled = this.throttledCreateActivityLogMessage.toString() !== createActivityLogMessage.toString();
        if (isThrottled) {
            this.addThrottledMessage()
                .then(() => {
                    console.warn('nango.log is being throttled. See the activity tab for more information.');
                })
                .catch((error) => {
                    console.error(error);
                });
        }
        */
    }

    /*
    async addThrottledMessage() {
        await createActivityLogMessage({
            level: 'error',
            activity_log_id: this.activityLogId as number,
            content: `nango.log can only be called every ${THROTTLE_TIME} milliseconds, some logs were dropped. Please consider adding a timeout or logging less.`,
            timestamp: Date.now()
        });
    }
    */

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

        //await this.throttledCreateActivityLogMessage({
        await createActivityLogMessage({
            level: userDefinedLevel?.level ?? 'info',
            activity_log_id: this.activityLogId as number,
            content,
            timestamp: Date.now()
        });
    }
}
