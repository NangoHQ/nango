import { Nango } from '@nangohq/node';
import type { ProxyConfiguration } from '@nangohq/runner-sdk';
import { InvalidRecordSDKError, NangoActionBase, NangoSyncBase } from '@nangohq/runner-sdk';
import type { AdminAxiosProps } from '@nangohq/node';
import type { DryRunServiceInterface, Metadata, NangoProps, UserLogParameters } from '@nangohq/types';
import type { AxiosResponse } from 'axios';

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
    dryRunService: DryRunServiceInterface;
    dryRun = true;

    constructor(props: NangoProps, cliProps: { dryRunService: DryRunServiceInterface }) {
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
    dryRunService: DryRunServiceInterface;
    dryRun = true;

    logMessages: { counts: { updated: number; added: number; deleted: number }; messages: unknown[] } = {
        counts: { updated: 0, added: 0, deleted: 0 },
        messages: []
    };

    rawSaveOutput = new Map<string, unknown[]>();
    rawDeleteOutput = new Map<string, unknown[]>();
    stubbedMetadata?: Metadata | undefined = undefined;

    constructor(props: NangoProps, cliProps: { stubbedMetadata?: Metadata | undefined; dryRunService: DryRunServiceInterface }) {
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

    public batchSave<T = any>(results: T[], model: string) {
        if (!results || results.length === 0) {
            console.info('batchSave received an empty array. No records to save.');
            return true;
        }

        // Validate records
        const hasErrors = this.validateRecords(model, results);

        if (hasErrors.length > 0) {
            this.log('Invalid record payload. Use `--validation` option to see the details', { level: 'warn' });
            if (this.runnerFlags?.validateSyncRecords) {
                throw new InvalidRecordSDKError({ ...hasErrors[0], model });
            }
        }

        this.logMessages?.messages.push(`A batch save call would save the following data to the ${model} model:`);
        for (const msg of results) {
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

    public batchDelete<T = any>(results: T[], model: string) {
        if (!results || results.length === 0) {
            console.info('batchDelete received an empty array. No records to delete.');
            return true;
        }

        this.logMessages?.messages.push(`A batch delete call would delete the following data:`);
        for (const msg of results) {
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

    public batchUpdate<T = any>(results: T[], model: string) {
        if (!results || results.length === 0) {
            console.info('batchUpdate received an empty array. No records to update.');
            return true;
        }

        this.logMessages?.messages.push(`A batch update call would update the following data to the ${model} model:`);
        for (const msg of results) {
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
}
