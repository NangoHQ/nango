import { isAxiosError } from 'axios';
import chalk from 'chalk';

import { Nango } from '@nangohq/node';
import { BASE_VARIANT, InvalidRecordSDKError, NangoActionBase, NangoSyncBase } from '@nangohq/runner-sdk';

import type { DryRunService } from './dryrun.service.js';
import type { AdminAxiosProps, ListRecordsRequestConfig } from '@nangohq/node';
import type { ProxyConfiguration } from '@nangohq/runner-sdk';
import type { GetPublicConnection, Metadata, NangoProps, UserLogParameters } from '@nangohq/types';
import type { AxiosError, AxiosResponse } from 'axios';

const logLevelToLogger = {
    info: 'info',
    debug: 'debug',
    error: 'error',
    warn: 'warn',
    http: 'info',
    verbose: 'debug',
    silly: 'debug'
} as const;
const logLevelToColor = {
    info: 'white',
    debug: 'gray',
    error: 'red',
    warn: 'yellow'
} as const;

export class NangoActionCLI extends NangoActionBase {
    nango: Nango;
    dryRunService: DryRunService;
    dryRun = true;

    constructor(props: NangoProps, cliProps: { dryRunService: DryRunService }) {
        super(props);

        this.dryRunService = cliProps.dryRunService;

        this.nango = new Nango({ isSync: false, dryRun: true, ...props }, getAxiosSettings(props));
    }

    public override async proxy<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        if (!config.method) {
            config.method = 'GET';
        }

        const res = await this.nango.proxy(config);
        if (isAxiosError(res)) {
            throw res;
        }
        return res;
    }

    public override log(...args: [...any]): void {
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

        const logLevel = logLevelToLogger[level] ?? 'info';

        if (args.length > 1 && 'type' in args[1] && args[1].type === 'http') {
            console[logLevel](args[0], { status: args[1]?.response?.code || 'xxx' });
        } else {
            console[logLevel](chalk[logLevelToColor[logLevel]](...args));
        }
    }

    public triggerSync(
        _providerConfigKey: string,
        connectionId: string,
        sync: string | { name: string; variant: string },
        _syncMode?: unknown
    ): Promise<void | string> {
        const syncArgs = typeof sync === 'string' ? { sync } : { sync: sync.name, variant: sync.variant };
        return this.dryRunService.run({
            ...syncArgs,
            connectionId,
            autoConfirm: true,
            debug: false
        });
    }

    public startSync(_providerConfigKey: string, _syncs: (string | { name: string; variant: string })[], _connectionId?: string): Promise<void> {
        this.log(`This has no effect but on a remote Nango instance would start a schedule`);
        return Promise.resolve();
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public override async tryAcquireLock(_props: { key: string; ttlMs: number }): Promise<boolean> {
        // Not applicable to CLI
        return true;
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public override async releaseLock(_props: { key: string }): Promise<boolean> {
        // Not applicable to CLI
        return true;
    }

    public override async releaseAllLocks(): Promise<void> {
        // Not applicable to CLI
    }
}

export class NangoSyncCLI extends NangoSyncBase {
    nango: Nango;
    dryRunService: DryRunService;
    dryRun = true;

    logMessages: { counts: { updated: number; added: number; deleted: number }; messages: unknown[] } = {
        counts: { updated: 0, added: 0, deleted: 0 },
        messages: []
    };

    rawSaveOutput = new Map<string, unknown[]>();
    rawDeleteOutput = new Map<string, unknown[]>();
    stubbedMetadata?: Metadata | undefined = undefined;

    constructor(props: NangoProps, cliProps: { stubbedMetadata?: Metadata | undefined; dryRunService: DryRunService }) {
        super(props);

        if (cliProps.stubbedMetadata) {
            this.stubbedMetadata = cliProps.stubbedMetadata;
        }

        this.dryRunService = cliProps.dryRunService;

        this.nango = new Nango({ isSync: true, dryRun: true, ...props }, getAxiosSettings(props));
    }

    // Can't double extends
    proxy = NangoActionCLI['prototype']['proxy'];
    log = NangoActionCLI['prototype']['log'];
    triggerSync = NangoActionCLI['prototype']['triggerSync'];
    startSync = NangoActionCLI['prototype']['startSync'];
    tryAcquireLock = NangoActionCLI['prototype']['tryAcquireLock'];
    releaseLock = NangoActionCLI['prototype']['releaseLock'];
    releaseAllLocks = NangoActionCLI['prototype']['releaseAllLocks'];

    public batchSave<T extends object>(results: T[], model: string) {
        if (!results || results.length === 0) {
            console.info('batchSave received an empty array. No records to save.');
            return true;
        }

        // Deduplicate results first before removing metadata keeping order and last occurrence
        const seenIds = new Set<string | number>();
        const deduplicatedResults: (T & { id: string | number })[] = [];

        for (let i = results.length - 1; i >= 0; i--) {
            const record = results[i] as T & { id: string | number };
            if (!seenIds.has(record.id)) {
                seenIds.add(record.id);
                deduplicatedResults.unshift(record);
            } else {
                console.warn(`batchSave detected duplicate records for ID: ${record.id}. Keeping the last occurrence.`);
            }
        }

        const resultsWithoutMetadata = this.removeMetadata(deduplicatedResults);

        // Validate records
        const hasErrors = this.validateRecords(model, resultsWithoutMetadata);

        if (hasErrors.length > 0) {
            this.log('Invalid record payload. Use `--validation` option to see the details', { level: 'warn' });
            if (this.runnerFlags?.validateSyncRecords) {
                throw new InvalidRecordSDKError({ ...hasErrors[0], model });
            }
        }

        this.logMessages?.messages.push(
            `A batch save call would save the following data to the ${model} model${this.variant === BASE_VARIANT ? `` : ` (variant: ${this.variant})`}:`
        );
        for (const msg of resultsWithoutMetadata) {
            this.logMessages?.messages.push(msg);
        }
        if (this.logMessages && this.logMessages.counts) {
            this.logMessages.counts.added = Number(this.logMessages.counts.added) + deduplicatedResults.length;
        }
        const modelFullName = this.modelFullName(model);
        if (this.rawSaveOutput) {
            if (!this.rawSaveOutput.has(modelFullName)) {
                this.rawSaveOutput.set(modelFullName, []);
            }
            this.rawSaveOutput.get(modelFullName)?.push(...deduplicatedResults);
        }
        return true;
    }

    public batchDelete<T extends object>(results: T[], model: string) {
        if (!results || results.length === 0) {
            console.info('batchDelete received an empty array. No records to delete.');
            return true;
        }

        const resultsWithoutMetadata = this.removeMetadata(results);

        this.logMessages?.messages.push(`A batch delete call would delete the following data:`);
        for (const msg of resultsWithoutMetadata) {
            this.logMessages?.messages.push(msg);
        }
        if (this.logMessages && this.logMessages.counts) {
            this.logMessages.counts.deleted = Number(this.logMessages.counts.deleted) + results.length;
        }
        const modelFullName = this.modelFullName(model);
        if (this.rawDeleteOutput) {
            if (!this.rawDeleteOutput.has(modelFullName)) {
                this.rawDeleteOutput.set(modelFullName, []);
            }
            this.rawDeleteOutput.get(modelFullName)?.push(...results);
        }
        return true;
    }

    public batchUpdate<T extends object>(results: T[], model: string) {
        if (!results || results.length === 0) {
            console.info('batchUpdate received an empty array. No records to update.');
            return true;
        }

        const resultsWithoutMetadata = this.removeMetadata(results);

        this.logMessages?.messages.push(
            `A batch update call would save the following data to the ${model} model${this.variant === BASE_VARIANT ? `` : ` (variant: ${this.variant})`}:`
        );
        for (const msg of resultsWithoutMetadata) {
            this.logMessages?.messages.push(msg);
        }
        if (this.logMessages && this.logMessages.counts) {
            this.logMessages.counts.updated = Number(this.logMessages.counts.updated) + results.length;
        }
        return true;
    }

    public override getMetadata<TMetadata = Metadata>(): Promise<TMetadata> {
        if (this.stubbedMetadata) {
            return Promise.resolve(this.stubbedMetadata as TMetadata);
        }

        return super.getMetadata<TMetadata>();
    }

    public override async getConnection(providerConfigKeyOverride?: string, connectionIdOverride?: string): Promise<GetPublicConnection['Success']> {
        const fetchedConnection = await super.getConnection(providerConfigKeyOverride, connectionIdOverride);
        if (this.stubbedMetadata) {
            return { ...fetchedConnection, metadata: this.stubbedMetadata };
        }

        return fetchedConnection;
    }

    public override async getRecordsByIds<K = string | number, T = any>(ids: K[], model: string): Promise<Map<K, T>> {
        const objects = new Map<K, T>();

        if (ids.length === 0) {
            return objects;
        }

        const externalIds = ids.map((id) => String(id).replaceAll('\x00', ''));
        const externalIdMap = new Map<string, K>(ids.map((id) => [String(id), id]));

        let cursor: string | null = null;
        for (let i = 0; i < ids.length; i += 100) {
            const batchIds = externalIds.slice(i, i + 100);

            const props: ListRecordsRequestConfig = {
                providerConfigKey: this.providerConfigKey,
                connectionId: this.connectionId,
                model: this.modelFullName(model),
                ids: batchIds
            };
            if (cursor) {
                props.cursor = cursor;
            }

            const response = await this.nango.listRecords<any>(props);

            const batchRecords = response.records;
            cursor = response.next_cursor;

            for (const record of batchRecords) {
                const stringId = String(record.id);
                const realId = externalIdMap.get(stringId);
                if (realId !== undefined) {
                    objects.set(realId, record as T);
                }
            }
        }

        return objects;
    }

    public override async setMergingStrategy(_merging: { strategy: 'ignore_if_modified_after' | 'override' }, _model: string) {
        // Not applicable to CLI
        return Promise.resolve();
    }
}

function getAxiosSettings(props: NangoProps) {
    const axiosSettings: AdminAxiosProps = {
        userAgent: 'sdk'
    };

    if (props.axios?.response) {
        axiosSettings.interceptors = {
            response: {
                onFulfilled: props.axios.response.onFulfilled,
                onRejected: props.axios.response.onRejected
            }
        };
    } else {
        axiosSettings.interceptors = {
            response: {
                onFulfilled: (res) => {
                    logAPICall(res);
                    return res;
                },
                onRejected: (err) => {
                    logAPICall(err as AxiosError);
                    return err;
                }
            }
        };
    }

    return axiosSettings;
}

function logAPICall(res: AxiosResponse | AxiosError): void {
    const method = res.config?.method?.toLocaleUpperCase(); // axios put it in lowercase
    if (isAxiosError(res)) {
        console.log(chalk.blue('http'), `[${chalk[res.status || 999 >= 400 ? 'red' : 'green'](res.status || 'xxx')}] ${method} ${res.config?.url}`);
        return;
    }

    console.log(chalk.blue('http'), `[${chalk[res.status >= 400 ? 'red' : 'green'](res.status)}] ${method} ${res.config.url}`);
}
