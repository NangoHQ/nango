import promptly from 'promptly';
import chalk from 'chalk';

import type { NangoConnection } from '@nangohq/shared';
import type { Metadata } from '@nangohq/types';
import { SyncConfigType, SyncType, syncRunService, cloudHost, stagingHost } from '@nangohq/shared';
import type { GlobalOptions } from '../types.js';
import { parseSecretKey, printDebug, hostport, getConnection, getConfig } from '../utils.js';
import configService from './config.service.js';
import { compileAllFiles } from './compile.service.js';
import integrationService from './local-integration.service.js';
import type { RecordsServiceInterface } from '@nangohq/shared/lib/services/sync/run.service.js';

interface RunArgs extends GlobalOptions {
    sync: string;
    connectionId: string;
    lastSyncDate?: string;
    useServerLastSyncDate?: boolean;
    input?: object;
    metadata?: Metadata;
    optionalEnvironment?: string;
    optionalProviderConfigKey?: string;
}

class DryRunService {
    environment?: string;
    returnOutput?: boolean;

    constructor(environment?: string, returnOutput = false) {
        if (environment) {
            this.environment = environment;
        }

        this.returnOutput = returnOutput;
    }
    public async run(options: RunArgs, debug = false): Promise<string | void> {
        let syncName = '';
        let connectionId, suppliedLastSyncDate, actionInput, rawStubbedMetadata;

        const environment = options.optionalEnvironment || this.environment;

        if (!environment) {
            console.log(chalk.red('Environment is required'));
            return;
        }

        await parseSecretKey(environment, debug);

        if (!process.env['NANGO_HOSTPORT']) {
            if (debug) {
                printDebug(`NANGO_HOSTPORT is not set. Setting the default to ${hostport}`);
            }
            process.env['NANGO_HOSTPORT'] = hostport;
        }

        if (debug) {
            printDebug(`NANGO_HOSTPORT is set to ${process.env['NANGO_HOSTPORT']}`);
        }

        if (Object.keys(options).length > 0) {
            ({ sync: syncName, connectionId, lastSyncDate: suppliedLastSyncDate, input: actionInput, metadata: rawStubbedMetadata } = options);
        }

        if (!syncName) {
            console.log(chalk.red('Sync name is required'));
            return;
        }

        if (!connectionId) {
            console.log(chalk.red('Connection id is required'));
            return;
        }

        const { success, error, response: config } = await configService.load('', debug);

        if (!success || !config) {
            console.log(chalk.red(error?.message));
            return;
        }

        let providerConfigKey = options.optionalProviderConfigKey;
        let isPostConnectionScript = false;

        if (!providerConfigKey) {
            providerConfigKey = config.find((config) => [...config.syncs, ...config.actions].find((sync) => sync.name === syncName))?.providerConfigKey;

            if (!providerConfigKey) {
                providerConfigKey =
                    config.find((config) => {
                        if (config.postConnectionScripts && config.postConnectionScripts.length > 0) {
                            return config.postConnectionScripts.some((postConnectionScript) => postConnectionScript === syncName);
                        } else {
                            return false;
                        }
                    })?.providerConfigKey || '';
                isPostConnectionScript = true;
            }

            if (!providerConfigKey) {
                console.log(
                    chalk.red(
                        `Provider config key not found, please check that the provider exists for this sync name: ${syncName} by going to the Nango dashboard.`
                    )
                );
                return;
            }
        }

        const foundConfig = config.find((configItem) => {
            const syncsArray = configItem.syncs || [];
            const actionsArray = configItem.actions || [];

            return [...syncsArray, ...actionsArray].some((sync) => sync.name === syncName);
        });

        const syncInfo = foundConfig
            ? (foundConfig.syncs || []).find((sync) => sync.name === syncName) || (foundConfig.actions || []).find((action) => action.name === syncName)
            : null;

        if (debug) {
            printDebug(`Provider config key found to be ${providerConfigKey}`);
        }

        const nangoConnection = (await getConnection(
            providerConfigKey,
            connectionId,
            {
                'Nango-Is-Sync': true,
                'Nango-Is-Dry-Run': true
            },
            debug
        )) as unknown as NangoConnection;

        if (!nangoConnection) {
            console.log(chalk.red('Connection not found'));
            return;
        }

        if (debug) {
            printDebug(`Connection found with ${JSON.stringify(nangoConnection, null, 2)}`);
        }

        const {
            config: { provider }
        } = await getConfig(providerConfigKey, debug);
        if (!provider) {
            console.log(chalk.red('Provider not found'));
            return;
        }
        if (debug) {
            printDebug(`Provider found: ${provider}`);
        }

        if (process.env['NANGO_HOSTPORT'] === cloudHost || process.env['NANGO_HOSTPORT'] === stagingHost) {
            process.env['NANGO_CLOUD'] = 'true';
        }

        let lastSyncDate = null;

        if (suppliedLastSyncDate) {
            if (debug) {
                printDebug(`Last sync date supplied as ${suppliedLastSyncDate}`);
            }
            lastSyncDate = new Date(suppliedLastSyncDate);
        }

        let type = 'sync';

        if (syncInfo?.type === SyncConfigType.ACTION) {
            type = 'action';
        }

        if (isPostConnectionScript) {
            type = 'post-connection-script';
        }

        const result = await compileAllFiles({ debug, scriptName: syncName, providerConfigKey, type });

        if (!result) {
            console.log(chalk.red('The sync/action did not compile successfully. Exiting'));
            return;
        }

        let normalizedInput;
        let stubbedMetadata;
        try {
            normalizedInput = JSON.parse(actionInput as unknown as string);
        } catch {
            normalizedInput = actionInput;
        }

        try {
            stubbedMetadata = JSON.parse(rawStubbedMetadata as unknown as string);
        } catch {
            stubbedMetadata = rawStubbedMetadata;
        }

        const logMessages = {
            counts: { updated: 0, added: 0, deleted: 0 },
            messages: []
        };

        // dry-run mode does not read or write to the records database
        // so we can safely mock the records service
        const recordsService: RecordsServiceInterface = {
            markNonCurrentGenerationRecordsAsDeleted: ({
                connectionId: _connectionId,
                model: _model,
                syncId: _syncId,
                generation: _generation
            }: {
                connectionId: number;
                model: string;
                syncId: string;
                generation: number;
                // eslint-disable-next-line @typescript-eslint/require-await
            }): Promise<string[]> => {
                return Promise.resolve([]);
            }
        };

        const syncRun = new syncRunService({
            integrationService,
            recordsService,
            dryRunService: new DryRunService(environment, true),
            writeToDb: false,
            nangoConnection,
            provider,
            input: normalizedInput as object,
            isAction: syncInfo?.type === SyncConfigType.ACTION,
            isPostConnectionScript,
            syncId: 'abc',
            syncJobId: -1,
            syncName,
            syncType: SyncType.INITIAL,
            loadLocation: './',
            debug,
            logMessages,
            stubbedMetadata
        });

        try {
            const secretKey = process.env['NANGO_SECRET_KEY'];
            const results = await syncRun.run(lastSyncDate, true, secretKey, process.env['NANGO_HOSTPORT']);

            let resultOutput = '';

            if (results) {
                console.log(JSON.stringify(results, null, 2));
                resultOutput += JSON.stringify(results, null, 2);
            }

            if (syncRun.logMessages && syncRun.logMessages.messages.length > 0) {
                const logMessages = syncRun.logMessages.messages;
                let index = 0;
                const batchCount = 10;

                const displayBatch = () => {
                    for (let i = 0; i < batchCount && index < logMessages.length; i++, index++) {
                        const logs = logMessages[index];
                        console.log(chalk.yellow(JSON.stringify(logs, null, 2)));
                        resultOutput += JSON.stringify(logs, null, 2);
                    }
                };

                console.log(chalk.yellow(`The dry run would produce the following results: ${JSON.stringify(syncRun.logMessages.counts, null, 2)}`));
                resultOutput += `The dry run would produce the following results: ${JSON.stringify(syncRun.logMessages.counts, null, 2)}`;
                console.log(chalk.yellow('The following log messages were generated:'));
                resultOutput += 'The following log messages were generated:';

                displayBatch();

                while (index < syncRun.logMessages.messages.length) {
                    const remaining = syncRun.logMessages.messages.length - index;
                    const confirmation = await promptly.confirm(
                        `There are ${remaining} logs messages remaining. Would you like to see the next 10 log messages? (y/n)`
                    );
                    if (confirmation) {
                        displayBatch();
                    } else {
                        break;
                    }
                }
            }

            if (this.returnOutput) {
                return resultOutput;
            }

            process.exit(0);
        } catch {
            process.exit(1);
        }
    }
}

const dryRunService = new DryRunService();
export default dryRunService;
