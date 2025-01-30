import https from 'node:https';
import type { AxiosInstance, AxiosResponse } from 'axios';
import axios, { AxiosError } from 'axios';

import { getUserAgent, Nango } from '@nangohq/node';
import type { ProxyConfiguration } from '@nangohq/runner-sdk';
import { InvalidRecordSDKError, NangoActionBase, NangoSyncBase } from '@nangohq/runner-sdk';
import { getPersistAPIUrl, proxyService } from '@nangohq/shared';
import type { MessageRowInsert, NangoProps, UserLogParameters } from '@nangohq/types';
import {
    getLogger,
    httpRetryStrategy,
    isTest,
    MAX_LOG_PAYLOAD,
    metrics,
    redactHeaders,
    redactURL,
    retryWithBackoff,
    stringifyAndTruncateValue,
    stringifyObject,
    truncateJson
} from '@nangohq/utils';

const logger = getLogger('SDK');

export const oldLevelToNewLevel = {
    debug: 'debug',
    info: 'info',
    warn: 'warn',
    error: 'error',
    verbose: 'debug',
    silly: 'debug',
    http: 'info'
} as const;

export const defaultPersistApi = axios.create({
    baseURL: getPersistAPIUrl(),
    httpsAgent: new https.Agent({ keepAlive: true }),
    headers: {
        'User-Agent': getUserAgent('sdk')
    },
    validateStatus: (_status) => {
        return true;
    }
});

const RECORDS_VALIDATION_SAMPLE = 5;

/**
 * Action SDK
 */
export class NangoActionRunner extends NangoActionBase {
    nango: Nango;
    protected persistApi: AxiosInstance;

    constructor(props: NangoProps, runnerProps?: { persistApi: AxiosInstance }) {
        super(props);
        this.persistApi = runnerProps?.persistApi || defaultPersistApi;

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
        let response: AxiosResponse;
        try {
            response = await retryWithBackoff(
                async () => {
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

                    return await this.persistApi({
                        method: 'POST',
                        url: `/environment/${this.environmentId}/log`,
                        headers: {
                            Authorization: `Bearer ${this.nango.secretKey}`,
                            'Content-Type': 'application/json'
                        },
                        data
                    });
                },
                { retry: httpRetryStrategy }
            );
        } catch (err) {
            logger.error('Failed to log to persist, due to an internal error', err instanceof AxiosError ? err.code : err);
            // We don't want to block a sync because logging failed, so we fail silently until we have a way to report error
            // TODO: find a way to report that
            return;
        }

        if (response.status > 299) {
            logger.error(
                `Request to persist API (log) failed: errorCode=${response.status} response='${JSON.stringify(response.data)}' log=${JSON.stringify(log)}`,
                this.stringify()
            );
            throw new Error(`Failed to log: ${JSON.stringify(response.data)}`);
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
        );
        return res;
    }
}

/**
 * Sync SDK
 */
export class NangoSyncRunner extends NangoSyncBase {
    nango: Nango;

    protected persistApi: AxiosInstance;
    private batchSize = 1000;

    constructor(props: NangoProps, runnerProps?: { persistApi?: AxiosInstance }) {
        super(props);

        this.persistApi = runnerProps?.persistApi || defaultPersistApi;
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

    public async batchSave<T = any>(results: T[], model: string) {
        this.throwIfAborted();
        if (!results || results.length === 0) {
            return true;
        }

        // Validate records
        const hasErrors = this.validateRecords(model, results);

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

        for (let i = 0; i < results.length; i += this.batchSize) {
            const batch = results.slice(i, i + this.batchSize);
            let response: AxiosResponse;
            try {
                response = await retryWithBackoff(
                    () => {
                        return this.persistApi({
                            method: 'POST',
                            url: `/environment/${this.environmentId}/connection/${this.nangoConnectionId}/sync/${this.syncId}/job/${this.syncJobId}/records`,
                            headers: {
                                Authorization: `Bearer ${this.nango.secretKey}`
                            },
                            data: {
                                model,
                                records: batch,
                                providerConfigKey: this.providerConfigKey,
                                connectionId: this.connectionId,
                                activityLogId: this.activityLogId
                            }
                        });
                    },
                    { retry: httpRetryStrategy }
                );
            } catch (err) {
                logger.error('Internal error', err instanceof AxiosError ? err.code : err);
                throw new Error('Failed to save records due to an internal error', { cause: err });
            }

            if (response.status > 299) {
                logger.error(
                    `Request to persist API (batchSave) failed: errorCode=${response.status} response='${JSON.stringify(response.data)}'`,
                    this.stringify()
                );

                const message = 'error' in response.data && 'message' in response.data.error ? response.data.error.message : JSON.stringify(response.data);
                throw new Error(message);
            }
        }
        return true;
    }

    public async batchDelete<T = any>(results: T[], model: string) {
        this.throwIfAborted();
        if (!results || results.length === 0) {
            return true;
        }

        for (let i = 0; i < results.length; i += this.batchSize) {
            const batch = results.slice(i, i + this.batchSize);
            let response: AxiosResponse;
            try {
                response = await retryWithBackoff(
                    async () => {
                        return await this.persistApi({
                            method: 'DELETE',
                            url: `/environment/${this.environmentId}/connection/${this.nangoConnectionId}/sync/${this.syncId}/job/${this.syncJobId}/records`,
                            headers: {
                                Authorization: `Bearer ${this.nango.secretKey}`
                            },
                            data: {
                                model,
                                records: batch,
                                providerConfigKey: this.providerConfigKey,
                                connectionId: this.connectionId,
                                activityLogId: this.activityLogId
                            }
                        });
                    },
                    { retry: httpRetryStrategy }
                );
            } catch (err) {
                logger.error('Internal error', err instanceof AxiosError ? err.code : err);
                throw new Error('Failed to delete records due to an internal error', { cause: err });
            }

            if (response.status > 299) {
                logger.error(
                    `Request to persist API (batchDelete) failed: errorCode=${response.status} response='${JSON.stringify(response.data)}'`,
                    this.stringify()
                );
                const message = 'error' in response.data && 'message' in response.data.error ? response.data.error.message : JSON.stringify(response.data);
                throw new Error(message);
            }
        }

        return true;
    }

    public async batchUpdate<T = any>(results: T[], model: string) {
        this.throwIfAborted();
        if (!results || results.length === 0) {
            return true;
        }

        for (let i = 0; i < results.length; i += this.batchSize) {
            const batch = results.slice(i, i + this.batchSize);
            let response: AxiosResponse;
            try {
                response = await retryWithBackoff(
                    async () => {
                        return await this.persistApi({
                            method: 'PUT',
                            url: `/environment/${this.environmentId}/connection/${this.nangoConnectionId}/sync/${this.syncId}/job/${this.syncJobId}/records`,
                            headers: {
                                Authorization: `Bearer ${this.nango.secretKey}`
                            },
                            data: {
                                model,
                                records: batch,
                                providerConfigKey: this.providerConfigKey,
                                connectionId: this.connectionId,
                                activityLogId: this.activityLogId
                            }
                        });
                    },
                    { retry: httpRetryStrategy }
                );
            } catch (err) {
                logger.error('Internal error', err instanceof AxiosError ? err.code : err);
                throw new Error('Failed to update records due to an internal error', { cause: err });
            }

            if (response.status > 299) {
                logger.error(
                    `Request to persist API (batchUpdate) failed: errorCode=${response.status} response='${JSON.stringify(response.data)}'`,
                    this.stringify()
                );
                const message = 'error' in response.data && 'message' in response.data.error ? response.data.error.message : JSON.stringify(response.data);
                throw new Error(message);
            }
        }
        return true;
    }
}

const TELEMETRY_ALLOWED_METHODS: (keyof NangoSyncBase)[] = [
    'batchDelete',
    'batchSave',
    'batchSend',
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
