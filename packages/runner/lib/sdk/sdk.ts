import type { AxiosResponse } from 'axios';

import { Nango } from '@nangohq/node';
import type { ProxyConfiguration } from '@nangohq/runner-sdk';
import { InvalidRecordSDKError, NangoActionBase, NangoSyncBase } from '@nangohq/runner-sdk';
import { proxyService } from '@nangohq/shared';
import type { MessageRowInsert, NangoProps, UserLogParameters, MergingStrategy } from '@nangohq/types';
import { isTest, MAX_LOG_PAYLOAD, metrics, redactHeaders, redactURL, stringifyAndTruncateValue, stringifyObject, truncateJson } from '@nangohq/utils';
import { PersistClient } from './persist.js';

export const oldLevelToNewLevel = {
    debug: 'debug',
    info: 'info',
    warn: 'warn',
    error: 'error',
    verbose: 'debug',
    silly: 'debug',
    http: 'info'
} as const;

const RECORDS_VALIDATION_SAMPLE = 1;

/**
 * Action SDK
 */
export class NangoActionRunner extends NangoActionBase {
    nango: Nango;
    protected persistClient: PersistClient;

    constructor(props: NangoProps, runnerProps?: { persistClient: PersistClient }) {
        super(props);
        this.persistClient = runnerProps?.persistClient || new PersistClient({ secretKey: props.secretKey });

        this.nango = new Nango(
            { isSync: false, dryRun: isTest, ...props },
            {
                interceptors: { response: { onFulfilled: this.logAPICall.bind(this) } }
            }
        );

        if (!this.activityLogId) throw new Error('Parameter activityLogId is required when not in dryRun');
        if (!this.environmentId) throw new Error('Parameter environmentId is required when not in dryRun');
        if (!this.nangoConnectionId) throw new Error('Parameter nangoConnectionId is required when not in dryRun');
        if (!this.syncConfig) throw new Error('Parameter syncConfig is required when not in dryRun');
    }

    public override async proxy<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        this.throwIfAborted();
        if (!config.method) {
            config.method = 'GET';
        }

        const { connectionId, providerConfigKey } = config;
        const connection = await this.getConnection(providerConfigKey, connectionId);
        if (!connection) {
            throw new Error(`Connection not found using the provider config key ${this.providerConfigKey} and connection id ${this.connectionId}`);
        }

        const proxyConfig = this.proxyConfig(config);

        const { response, logs } = await proxyService.route(proxyConfig, {
            existingActivityLogId: this.activityLogId as string,
            connection,
            providerName: this.provider as string
        });

        // We batch save, since we have buffered the createdAt it shouldn't impact order
        await Promise.all(
            logs.map(async (log) => {
                if (log.level === 'debug') {
                    return;
                }
                await this.sendLogToPersist(log);
            })
        );

        if (response instanceof Error) {
            throw response;
        }

        return response;
    }

    public override async log(...args: [...any]): Promise<void> {
        this.throwIfAborted();
        if (args.length === 0) {
            return;
        }

        const lastArg = args[args.length - 1];
        const isUserDefinedLevel = (object: UserLogParameters): boolean => {
            return lastArg && typeof lastArg === 'object' && 'level' in object;
        };
        const userDefinedLevel: UserLogParameters | undefined = isUserDefinedLevel(lastArg) ? lastArg : undefined;

        if (userDefinedLevel) {
            args.pop();
        }

        const level = userDefinedLevel?.level ?? 'info';
        const [message, payload] = args;

        // arrays are not supported in the log meta, so we convert them to objects
        const meta = Array.isArray(payload) ? Object.fromEntries(payload.map((e, i) => [i, e])) : payload || null;

        await this.sendLogToPersist({
            type: 'log',
            level: oldLevelToNewLevel[level],
            source: 'user',
            message: stringifyAndTruncateValue(message),
            meta,
            createdAt: new Date().toISOString(),
            environmentId: this.environmentId
        });
    }

    public triggerSync(providerConfigKey: string, connectionId: string, syncName: string, fullResync?: boolean): Promise<void | string> {
        this.throwIfAborted();
        return this.nango.triggerSync(providerConfigKey, [syncName], connectionId, fullResync);
    }

    private async sendLogToPersist(log: MessageRowInsert) {
        let data = stringifyObject({ activityLogId: this.activityLogId, log });

        // We try to keep log object under an acceptable size, before reaching network
        // The idea is to always log something instead of silently crashing without overloading persist
        if (data.length > MAX_LOG_PAYLOAD) {
            log.message += ` ... (truncated, payload was too large)`;
            // Truncating can remove mandatory field so we only try to truncate meta
            if (log.meta) {
                data = stringifyObject({
                    activityLogId: this.activityLogId,
                    log: { ...log, meta: truncateJson(log.meta) as MessageRowInsert['meta'] }
                });
            }
        }
        const res = await this.persistClient.saveLog({
            environmentId: this.environmentId,
            data
        });
        if (res.isErr()) {
            throw res.error;
        }
    }

    private logAPICall(res: AxiosResponse): AxiosResponse {
        if (!res.config.url) {
            return res;
        }

        // We compte on the fly because connection's credentials can change during a single run
        // We could further optimize this and cache it when the memoizedConnection is updated
        const valuesToFilter: string[] = [
            ...Array.from(this.memoizedConnections.values()).reduce<string[]>((acc, conn) => {
                if (!conn) {
                    return acc;
                }
                acc.push(...Object.values(conn.connection.credentials));
                return acc;
            }, []),
            this.nango.secretKey
        ];

        const method = res.config.method?.toLocaleUpperCase(); // axios put it in lowercase;
        void this.log(
            `${method} ${res.config.url}`,
            {
                type: 'http',
                request: {
                    method: method,
                    url: redactURL({ url: res.config.url, valuesToFilter }),
                    headers: redactHeaders({ headers: res.config.headers, valuesToFilter })
                },
                response: {
                    code: res.status,
                    headers: redactHeaders({ headers: res.headers, valuesToFilter })
                }
            },
            { level: res.status > 299 ? 'error' : 'info' }
        ).catch(() => {
            // this.log can throw when the script is aborted
            // since it is not awaited, the exception might not be caught
            // we therefore swallow the exception here to avoid an unhandledRejection error
        });
        return res;
    }
}

/**
 * Sync SDK
 */
export class NangoSyncRunner extends NangoSyncBase {
    nango: Nango;

    protected persistClient: PersistClient;
    private batchSize = 1000;
    private getRecordsBatchSize = 100;
    private mergingByModel = new Map<string, MergingStrategy>();

    constructor(props: NangoProps, runnerProps?: { persistClient?: PersistClient }) {
        super(props);

        this.persistClient = runnerProps?.persistClient || new PersistClient({ secretKey: props.secretKey });
        this.nango = new Nango(
            { isSync: true, dryRun: isTest, ...props },
            {
                interceptors: { response: { onFulfilled: this.logAPICall.bind(this) } }
            }
        );

        if (!this.syncId) throw new Error('Parameter syncId is required when not in dryRun');
        if (!this.syncJobId) throw new Error('Parameter syncJobId is required when not in dryRun');
    }

    // Can't double extends
    proxy = NangoActionRunner['prototype']['proxy'];
    log = NangoActionRunner['prototype']['log'];
    triggerSync = NangoActionRunner['prototype']['triggerSync'];
    sendLogToPersist = NangoActionRunner['prototype']['sendLogToPersist'];
    logAPICall = NangoActionRunner['prototype']['logAPICall'];

    public async setMergingStrategy(merging: { strategy: 'ignore_if_modified_after' | 'override' }, model: string): Promise<void> {
        const now = new Date();
        if (this.mergingByModel.has(model)) {
            await this.sendLogToPersist({
                type: 'log',
                level: 'warn',
                source: 'user',
                message: `Merging strategy for model ${model} is already set. Skipping`,
                createdAt: now.toISOString(),
                environmentId: this.environmentId,
                meta: { model, merging }
            });
            return;
        }
        switch (merging.strategy) {
            case 'ignore_if_modified_after': {
                const res = await this.persistClient.getCursor({
                    environmentId: this.environmentId,
                    nangoConnectionId: this.nangoConnectionId!,
                    model: model,
                    offset: 'last'
                });
                if (res.isErr()) {
                    throw res.error;
                }
                this.mergingByModel.set(model, { strategy: 'ignore_if_modified_after_cursor', ...(res.value ? { cursor: res.value.cursor } : {}) });
                break;
            }
            case 'override':
                this.mergingByModel.set(model, { strategy: 'override' });
                break;
            default:
                throw new Error(`Unsupported merging strategy: ${merging.strategy}`);
        }
        await this.sendLogToPersist({
            type: 'log',
            level: 'info',
            source: 'user',
            message: `Merging strategy set to '${merging.strategy}' for model ${model}.`,
            createdAt: now.toISOString(),
            environmentId: this.environmentId
        });
    }

    private getMergingStrategy(model: string): MergingStrategy {
        return this.mergingByModel.get(model) || { strategy: 'override' };
    }

    private setMergingStrategyByModel(model: string, merging: MergingStrategy): void {
        this.mergingByModel.set(model, merging);
    }

    public async batchSave<T extends object>(results: T[], model: string) {
        this.throwIfAborted();
        if (!results || results.length === 0) {
            return true;
        }

        const resultsWithoutMetadata = this.removeMetadata(results);

        // Validate records
        const hasErrors = this.validateRecords(model, resultsWithoutMetadata);

        if (hasErrors.length > 0) {
            metrics.increment(metrics.Types.RUNNER_INVALID_SYNCS_RECORDS, hasErrors.length);
            if (this.runnerFlags?.validateSyncRecords) {
                throw new InvalidRecordSDKError({ ...hasErrors[0], model });
            }

            const sampled = hasErrors.length > RECORDS_VALIDATION_SAMPLE;
            const sample = sampled ? hasErrors.slice(0, RECORDS_VALIDATION_SAMPLE) : hasErrors;
            if (sampled) {
                await this.log(`Invalid records: ${hasErrors.length} failed ${sampled ? `(sampled to ${RECORDS_VALIDATION_SAMPLE})` : ''}`, { level: 'warn' });
            }
            await Promise.all(
                sample.map((log) => {
                    return this.log(`Invalid record payload`, { ...log, model }, { level: 'warn' });
                })
            );
        }

        for (let i = 0; i < resultsWithoutMetadata.length; i += this.batchSize) {
            const batch = resultsWithoutMetadata.slice(i, i + this.batchSize);
            const res = await this.persistClient.saveRecords({
                model,
                records: batch,
                environmentId: this.environmentId,
                providerConfigKey: this.providerConfigKey,
                connectionId: this.connectionId,
                nangoConnectionId: this.nangoConnectionId!,
                syncId: this.syncId!,
                syncJobId: this.syncJobId!,
                activityLogId: this.activityLogId!,
                merging: this.getMergingStrategy(model)
            });
            if (res.isErr()) {
                throw res.error;
            }
            this.setMergingStrategyByModel(model, res.value.nextMerging);
        }
        return true;
    }

    public async batchDelete<T extends object>(results: T[], model: string) {
        this.throwIfAborted();
        if (!results || results.length === 0) {
            return true;
        }

        const resultsWithoutMetadata = this.removeMetadata(results);

        for (let i = 0; i < resultsWithoutMetadata.length; i += this.batchSize) {
            const batch = resultsWithoutMetadata.slice(i, i + this.batchSize);
            const res = await this.persistClient.deleteRecords({
                model,
                records: batch,
                environmentId: this.environmentId,
                providerConfigKey: this.providerConfigKey,
                connectionId: this.connectionId,
                nangoConnectionId: this.nangoConnectionId!,
                syncId: this.syncId!,
                syncJobId: this.syncJobId!,
                activityLogId: this.activityLogId!,
                merging: this.getMergingStrategy(model)
            });
            if (res.isErr()) {
                throw res.error;
            }
            this.setMergingStrategyByModel(model, res.value.nextMerging);
        }

        return true;
    }

    public async batchUpdate<T extends object>(results: T[], model: string) {
        this.throwIfAborted();
        if (!results || results.length === 0) {
            return true;
        }

        const resultsWithoutMetadata = this.removeMetadata(results);

        for (let i = 0; i < resultsWithoutMetadata.length; i += this.batchSize) {
            const batch = resultsWithoutMetadata.slice(i, i + this.batchSize);
            const res = await this.persistClient.updateRecords({
                model,
                records: batch,
                environmentId: this.environmentId,
                providerConfigKey: this.providerConfigKey,
                connectionId: this.connectionId,
                nangoConnectionId: this.nangoConnectionId!,
                syncId: this.syncId!,
                syncJobId: this.syncJobId!,
                activityLogId: this.activityLogId!,
                merging: this.getMergingStrategy(model)
            });
            if (res.isErr()) {
                throw res.error;
            }
            this.setMergingStrategyByModel(model, res.value.nextMerging);
        }
        return true;
    }

    public async getRecordsByIds<K = string | number, T = any>(ids: K[], model: string): Promise<Map<K, T>> {
        this.throwIfAborted();

        const objects = new Map<K, T>();

        if (ids.length === 0) {
            return objects;
        }

        let cursor: string | undefined = undefined;
        for (let i = 0; i < ids.length; i += this.getRecordsBatchSize) {
            const externalIdMap = new Map<string, K>(ids.slice(i, i + this.getRecordsBatchSize).map((id) => [String(id), id]));

            const res = await this.persistClient.getRecords({
                model,
                externalIds: Array.from(externalIdMap.keys()),
                environmentId: this.environmentId,
                nangoConnectionId: this.nangoConnectionId!,
                cursor
            });

            if (res.isErr()) {
                throw res.error;
            }

            const { nextCursor, records } = res.unwrap();
            cursor = nextCursor;

            for (const record of records) {
                const stringId = String(record.id);
                const realId = externalIdMap.get(stringId);
                if (realId !== undefined) {
                    objects.set(realId, record as T);
                }
            }
        }

        return objects;
    }
}

const TELEMETRY_ALLOWED_METHODS: (keyof NangoSyncBase)[] = [
    'batchDelete',
    'batchSave',
    'batchUpdate',
    'batchSend',
    'getRecordsByIds',
    'getConnection',
    'getEnvironmentVariables',
    'getMetadata',
    'proxy',
    'log',
    'triggerAction',
    'triggerSync'
];

/**
 * @internal
 *
 * This function will enable tracing on the SDK
 * It has been split from the actual code to avoid making the code too dirty and to easily enable/disable tracing if there is an issue with it
 */
export function instrumentSDK(rawNango: NangoActionBase | NangoSyncBase) {
    return new Proxy(rawNango, {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
        get<T extends typeof rawNango, K extends keyof typeof rawNango>(target: T, propKey: K) {
            // Method name is not matching the allowList we don't do anything else
            if (!TELEMETRY_ALLOWED_METHODS.includes(propKey)) {
                return target[propKey];
            }

            return metrics.time(`${metrics.Types.RUNNER_SDK}.${propKey}` as any, (target[propKey] as any).bind(target));
        }
    });
}
