import { Nango } from '@nangohq/node';
import type { ProxyConfiguration } from '@nangohq/runner-sdk';
import { InvalidRecordSDKError, NangoActionBase, NangoSyncBase } from '@nangohq/runner-sdk';
import type { AdminAxiosProps, ListRecordsRequestConfig } from '@nangohq/node';
import type { Metadata, NangoProps, UserLogParameters } from '@nangohq/types';
import type { AxiosResponse } from 'axios';
import type { DryRunService } from './dryrun.service';

const logLevelToLogger = {
    info: 'info',
    debug: 'debug',
    error: 'error',
    warn: 'warn',
    http: 'info',
    verbose: 'debug',
    silly: 'debug'
} as const;

export class NangoActionCLI extends NangoActionBase {
    nango: Nango;
    dryRunService: DryRunService;
    dryRun = true;

    constructor(props: NangoProps, cliProps: { dryRunService: DryRunService }) {
        super(props);

        this.dryRunService = cliProps.dryRunService;

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
        }

        this.nango = new Nango({ isSync: false, dryRun: true, ...props }, axiosSettings);
    }

    public override proxy<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        if (!config.method) {
            config.method = 'GET';
        }

        return this.nango.proxy(config);
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
            console[logLevel](...args);
        }
    }

    public triggerSync(_providerConfigKey: string, connectionId: string, syncName: string, _fullResync?: boolean): Promise<void | string> {
        return this.dryRunService.run({
            sync: syncName,
            connectionId,
            autoConfirm: true,
            debug: false
        });
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
        }

        this.nango = new Nango({ isSync: true, dryRun: true, ...props }, axiosSettings);
    }

    // Can't double extends
    proxy = NangoActionCLI['prototype']['proxy'];
    log = NangoActionCLI['prototype']['log'];
    triggerSync = NangoActionCLI['prototype']['triggerSync'];

    public batchSave<T extends object>(results: T[], model: string) {
        if (!results || results.length === 0) {
            console.info('batchSave received an empty array. No records to save.');
            return true;
        }

        const resultsWithoutMetadata = this.removeMetadata(results);

        // Validate records
        const hasErrors = this.validateRecords(model, resultsWithoutMetadata);

        if (hasErrors.length > 0) {
            this.log('Invalid record payload. Use `--validation` option to see the details', { level: 'warn' });
            if (this.runnerFlags?.validateSyncRecords) {
                throw new InvalidRecordSDKError({ ...hasErrors[0], model });
            }
        }

        this.logMessages?.messages.push(`A batch save call would save the following data to the ${model} model:`);
        for (const msg of resultsWithoutMetadata) {
            this.logMessages?.messages.push(msg);
        }
        if (this.logMessages && this.logMessages.counts) {
            this.logMessages.counts.added = Number(this.logMessages.counts.added) + results.length;
        }
        if (this.rawSaveOutput) {
            if (!this.rawSaveOutput.has(model)) {
                this.rawSaveOutput.set(model, []);
            }
            this.rawSaveOutput.get(model)?.push(...results);
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
        if (this.rawDeleteOutput) {
            if (!this.rawDeleteOutput.has(model)) {
                this.rawDeleteOutput.set(model, []);
            }
            this.rawDeleteOutput.get(model)?.push(...results);
        }
        return true;
    }

    public batchUpdate<T extends object>(results: T[], model: string) {
        if (!results || results.length === 0) {
            console.info('batchUpdate received an empty array. No records to update.');
            return true;
        }

        const resultsWithoutMetadata = this.removeMetadata(results);

        this.logMessages?.messages.push(`A batch update call would update the following data to the ${model} model:`);
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
                model,
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
}
