import promptly from 'promptly';
import chalk from 'chalk';

import type { NangoConnection } from '@nangohq/shared';
import type { Metadata, ScriptFileType } from '@nangohq/types';
import { SyncType, cloudHost, stagingHost, SyncRunService } from '@nangohq/shared';
import type { GlobalOptions } from '../types.js';
import { parseSecretKey, printDebug, hostport, getConnection, getConfig } from '../utils.js';
import { compileAllFiles } from './compile.service.js';
import integrationService from './local-integration.service.js';
import type { RecordsServiceInterface } from '@nangohq/shared/lib/services/sync/run.service.js';
import { parse } from './config.service.js';
import { loadSchemaJson } from './model.service.js';

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

export class DryRunService {
    fullPath: string;
    validation: boolean;
    environment?: string;
    returnOutput?: boolean;

    constructor({
        environment,
        returnOutput = false,
        fullPath,
        validation
    }: {
        environment?: string;
        returnOutput?: boolean;
        fullPath: string;
        validation: boolean;
    }) {
        this.fullPath = fullPath;
        this.validation = validation;
        if (environment) {
            this.environment = environment;
        }

        this.returnOutput = returnOutput;
    }

    public async run(options: RunArgs, debug = false): Promise<string | undefined> {
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

        const { success, error, response } = parse(process.cwd(), debug);
        if (!success || !response?.parsed) {
            console.log(chalk.red(error?.message));
            return;
        }

        let providerConfigKey = options.optionalProviderConfigKey;
        let isPostConnectionScript = false;

        if (!providerConfigKey) {
            providerConfigKey = response.parsed.integrations.find((integration) =>
                [...integration.syncs, ...integration.actions].find((sync) => sync.name === syncName)
            )?.providerConfigKey;

            if (!providerConfigKey) {
                providerConfigKey =
                    response.parsed.integrations.find((integration) => {
                        if (integration.postConnectionScripts && integration.postConnectionScripts.length > 0) {
                            return integration.postConnectionScripts.some((postConnectionScript) => postConnectionScript === syncName);
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

        const foundConfig = response.parsed.integrations.find((integration) => {
            const syncsArray = integration.syncs || [];
            const actionsArray = integration.actions || [];

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

        let type: ScriptFileType = 'syncs';
        if (syncInfo?.type === 'action') {
            type = 'actions';
        } else if (isPostConnectionScript) {
            type = 'post-connection-scripts';
        }

        const result = await compileAllFiles({ fullPath: process.cwd(), debug, scriptName: syncName, providerConfigKey, type });

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

        const jsonSchema = loadSchemaJson({ fullPath: this.fullPath });
        if (!jsonSchema) {
            console.log(chalk.red('Failed to load schema.json'));
            return;
        }

        const syncRun = new SyncRunService({
            integrationService,
            recordsService,
            dryRunService: new DryRunService({ environment, returnOutput: true, fullPath: this.fullPath, validation: this.validation }),
            writeToDb: false,
            nangoConnection,
            syncConfig: {
                sync_name: syncName,
                file_location: '',
                models: syncInfo?.output || [],
                input: syncInfo?.input || undefined,
                track_deletes: false,
                type: syncInfo?.type || 'sync',
                active: true,
                auto_start: false,
                enabled: true,
                environment_id: 1,
                model_schema: [],
                nango_config_id: 1,
                runs: '',
                webhook_subscriptions: [],
                models_json_schema: jsonSchema
            },
            provider,
            input: normalizedInput as object,
            isAction: syncInfo?.type === 'action',
            isPostConnectionScript,
            syncId: 'abc',
            syncJobId: -1,
            syncType: SyncType.INITIAL,
            loadLocation: './',
            debug,
            logMessages,
            stubbedMetadata,
            runnerFlags: {
                validateActionInput: this.validation, // irrelevant for cli
                validateActionOutput: this.validation, // irrelevant for cli
                validateSyncRecords: this.validation,
                validateSyncMetadata: false
            }
        });

        try {
            console.log('---');
            const secretKey = process.env['NANGO_SECRET_KEY'];
            const results = await syncRun.run(lastSyncDate, true, secretKey, process.env['NANGO_HOSTPORT']);
            console.log('---');

            if (results.error) {
                console.error(chalk.red('An error occurred during execution'));
                console.error(JSON.stringify(results.error, null, 2));
                return;
            }

            const resultOutput = [];
            if (type === 'actions') {
                if (!results.response) {
                    console.log(chalk.gray('no output'));
                    resultOutput.push(chalk.gray('no output'));
                } else {
                    console.log(JSON.stringify(results.response, null, 2));
                    resultOutput.push(JSON.stringify(results.response, null, 2));
                }
            }

            if (syncRun.logMessages && syncRun.logMessages.messages.length > 0) {
                const logMessages = syncRun.logMessages.messages;
                let index = 0;
                const batchCount = 10;

                const displayBatch = () => {
                    for (let i = 0; i < batchCount && index < logMessages.length; i++, index++) {
                        const logs = logMessages[index];
                        console.log(chalk.yellow(JSON.stringify(logs, null, 2)));
                        resultOutput.push(JSON.stringify(logs, null, 2));
                    }
                };

                console.log(chalk.yellow(`The dry run would produce the following results: ${JSON.stringify(syncRun.logMessages.counts, null, 2)}`));
                resultOutput.push(`The dry run would produce the following results: ${JSON.stringify(syncRun.logMessages.counts, null, 2)}`);
                console.log(chalk.yellow('The following log messages were generated:'));
                resultOutput.push('The following log messages were generated:');

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
                return resultOutput.join('\n');
            }

            process.exit(0);
        } catch {
            process.exit(1);
        }
    }
}
