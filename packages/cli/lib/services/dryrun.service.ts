import promptly from 'promptly';
import chalk from 'chalk';

import type { NangoConnection, NangoProps, ScriptExecutorInterface, RunScriptOptions, RunnerOutput } from '@nangohq/shared';
import type { Metadata, ScriptFileType } from '@nangohq/types';
import { cloudHost, stagingHost, NangoError, localFileService, validateData, NangoSync, formatScriptError, ActionError } from '@nangohq/shared';
import type { GlobalOptions } from '../types.js';
import { parseSecretKey, printDebug, hostport, getConnection, getConfig } from '../utils.js';
import { compileAllFiles } from './compile.service.js';
import { parse } from './config.service.js';
import { loadSchemaJson } from './model.service.js';
import { displayValidationError } from '../utils/errors.js';
import * as vm from 'vm';
import * as url from 'url';
import * as crypto from 'crypto';
import * as zod from 'zod';
import { Buffer } from 'buffer';

interface RunArgs extends GlobalOptions {
    sync: string;
    connectionId: string;
    lastSyncDate?: string;
    useServerLastSyncDate?: boolean;
    input?: unknown;
    metadata?: Metadata;
    optionalEnvironment?: string;
    optionalProviderConfigKey?: string;
}

export class DryRunService implements ScriptExecutorInterface {
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

        let stubbedMetadata;
        let normalizedInput;

        if (actionInput) {
            if (actionInput.toString().includes('@') && actionInput.toString().endsWith('.json')) {
                const fileContents = localFileService.readFile(actionInput.toString());
                if (!fileContents) {
                    console.log(chalk.red('The file could not be read. Please make sure it exists.'));
                    return;
                }
                try {
                    normalizedInput = JSON.parse(fileContents);
                } catch {
                    console.log(chalk.red('There was an issue parsing the action input file. Please make sure it is valid JSON.'));
                    return;
                }
            } else {
                try {
                    normalizedInput = JSON.parse(actionInput as string);
                } catch {
                    normalizedInput = actionInput;
                }
            }
        }

        if (rawStubbedMetadata) {
            if (rawStubbedMetadata.toString().includes('@') && rawStubbedMetadata.toString().endsWith('.json')) {
                const fileContents = localFileService.readFile(rawStubbedMetadata.toString());
                if (!fileContents) {
                    console.log(chalk.red('The metadata file could not be read. Please make sure it exists.'));
                    return;
                }
                try {
                    stubbedMetadata = JSON.parse(fileContents);
                } catch {
                    console.log(chalk.red('There was an issue parsing the metadata file. Please make sure it is valid JSON.'));
                    return;
                }
            } else {
                try {
                    stubbedMetadata = JSON.parse(rawStubbedMetadata as unknown as string);
                } catch {
                    stubbedMetadata = rawStubbedMetadata;
                }
            }
        }

        const logMessages = {
            counts: { updated: 0, added: 0, deleted: 0 },
            messages: []
        };

        const jsonSchema = loadSchemaJson({ fullPath: this.fullPath });
        if (!jsonSchema) {
            console.log(chalk.red('Failed to load schema.json'));
            return;
        }

        try {
            const syncConfig = {
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
                models_json_schema: jsonSchema,
                created_at: new Date(),
                updated_at: new Date()
            };
            const nangoProps: NangoProps = {
                host: process.env['NANGO_HOSTPORT'],
                connectionId: nangoConnection.connection_id,
                environmentId: nangoConnection.environment_id,
                environmentName: environment,
                providerConfigKey: nangoConnection.provider_config_key,
                provider,
                secretKey: process.env['NANGO_SECRET_KEY'] || '',
                nangoConnectionId: nangoConnection.id as number,
                syncId: 'dryrun-sync',
                lastSyncDate: lastSyncDate as Date,
                dryRun: true,
                logMessages,
                stubbedMetadata,
                syncConfig,
                dryRunService: new DryRunService({ environment, returnOutput: true, fullPath: this.fullPath, validation: this.validation }),
                runnerFlags: {
                    validateActionInput: this.validation, // irrelevant for cli
                    validateActionOutput: this.validation, // irrelevant for cli
                    validateSyncRecords: this.validation,
                    validateSyncMetadata: false
                }
            };
            const isAction = syncInfo?.type === 'action';
            const isWebhook = false;
            const isInvokedImmediately = Boolean(isAction || isWebhook || isPostConnectionScript);

            console.log('---');
            const results = await this.runScript({
                syncName,
                nangoProps,
                isInvokedImmediately,
                isWebhook,
                syncId: nangoProps.syncId as string,
                optionalLoadLocation: './',
                input: normalizedInput,
                writeToDb: false
            });
            console.log('---');

            if (results.error) {
                const err = results.error;
                console.error(chalk.red('An error occurred during execution'));
                if (err instanceof NangoError) {
                    console.error(chalk.red(err.message), chalk.gray(`(${err.type})`));
                    if (err.type === 'invalid_action_output' || err.type === 'invalid_action_input' || err.type === 'invalid_sync_record') {
                        displayValidationError(err.payload as any);
                        return;
                    }

                    console.error(JSON.stringify(err.payload, null, 2));
                    return;
                }

                console.error(JSON.stringify(err, null, 2));
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

            if (logMessages && logMessages.messages.length > 0) {
                const messages = logMessages.messages;
                let index = 0;
                const batchCount = 10;

                const displayBatch = () => {
                    for (let i = 0; i < batchCount && index < messages.length; i++, index++) {
                        const logs = messages[index];
                        console.log(chalk.yellow(JSON.stringify(logs, null, 2)));
                        resultOutput.push(JSON.stringify(logs, null, 2));
                    }
                };

                console.log(chalk.yellow(`The dry run would produce the following results: ${JSON.stringify(logMessages.counts, null, 2)}`));
                resultOutput.push(`The dry run would produce the following results: ${JSON.stringify(logMessages.counts, null, 2)}`);
                console.log(chalk.yellow('The following log messages were generated:'));
                resultOutput.push('The following log messages were generated:');

                displayBatch();

                while (index < logMessages.messages.length) {
                    const remaining = logMessages.messages.length - index;
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

    async runScript({ syncName, nangoProps, isInvokedImmediately, isWebhook, optionalLoadLocation, input }: RunScriptOptions): Promise<RunnerOutput> {
        const nango = new NangoSync(nangoProps);
        try {
            await nango.log(`Executing -> integration:"${nangoProps.provider}" script:"${syncName}"`);

            const script: string | null = localFileService.getIntegrationFile(syncName, nangoProps.providerConfigKey, optionalLoadLocation);
            const isAction = isInvokedImmediately && !isWebhook;

            if (!script) {
                const content = `Unable to find script file for "${syncName}"`;
                return { success: false, error: new NangoError(content, 500), response: null };
            }

            try {
                const wrappedScript = `
                    (function() {
                        var module = { exports: {} };
                        var exports = module.exports;
                        ${script}
                        return module.exports;
                    })();
                `;

                const scriptObj = new vm.Script(wrappedScript);
                const sandbox = {
                    console,
                    require: (moduleName: string) => {
                        switch (moduleName) {
                            case 'url':
                                return url;
                            case 'crypto':
                                return crypto;
                            case 'zod':
                                return zod;
                            default:
                                throw new Error(`Module '${moduleName}' is not allowed`);
                        }
                    },
                    Buffer,
                    setTimeout
                };

                const context = vm.createContext(sandbox);
                const scriptExports: any = scriptObj.runInContext(context);

                if (!scriptExports.default || !(typeof scriptExports.default === 'function')) {
                    const content = `There is no default export that is a function for ${syncName}`;
                    return { success: false, error: new NangoError(content, 500), response: null };
                }

                if (isAction) {
                    // Validate action input against json schema
                    const valInput = validateData({
                        version: nangoProps.syncConfig.version || '1',
                        input: input,
                        modelName: nangoProps.syncConfig.input,
                        jsonSchema: nangoProps.syncConfig.models_json_schema
                    });
                    if (Array.isArray(valInput)) {
                        await nango.log('Invalid action input. Use `--validation` option to see the details', { level: 'warn' });
                        if (nangoProps.runnerFlags.validateActionInput) {
                            return {
                                success: false,
                                response: null,
                                error: new NangoError('invalid_action_input', { data: input, validation: valInput, model: nangoProps.syncConfig.input })
                            };
                        }
                    }

                    const output = await scriptExports.default(nango, input);

                    // Validate action output against json schema
                    const modelNameOutput = nangoProps.syncConfig.models.length > 0 ? nangoProps.syncConfig.models[0] : undefined;
                    const valOutput = validateData({
                        version: nangoProps.syncConfig.version || '1',
                        input: output,
                        modelName: modelNameOutput,
                        jsonSchema: nangoProps.syncConfig.models_json_schema
                    });
                    if (Array.isArray(valOutput)) {
                        await nango.log('Invalid action output. Use `--validation` option to see the details', { level: 'warn' });
                        if (nangoProps.runnerFlags.validateActionOutput) {
                            return {
                                success: false,
                                response: null,
                                error: new NangoError('invalid_action_output', { data: output, validation: valOutput, model: modelNameOutput })
                            };
                        }
                    }

                    return { success: true, error: null, response: output };
                }

                const results = await scriptExports.default(nango);
                return { success: true, error: null, response: results };
            } catch (err) {
                if (err instanceof ActionError) {
                    return {
                        success: false,
                        error: {
                            type: err.type,
                            payload: err.payload || {},
                            status: 500
                        },
                        response: null
                    };
                } else if (err instanceof NangoError) {
                    return { success: false, error: err, response: null };
                }

                let errorType = 'sync_script_failure';
                if (isWebhook) {
                    errorType = 'webhook_script_failure';
                } else if (isInvokedImmediately) {
                    errorType = 'action_script_failure';
                }

                return formatScriptError(err, errorType, syncName);
            }
        } catch (err) {
            const errorMessage = JSON.stringify(err, ['message', 'name', 'stack'], 2);
            const content = `The script failed to load for ${syncName} with the following error: ${errorMessage}`;

            return { success: false, error: new NangoError(content, 500), response: null };
        } finally {
            await nango.log(`Done`);
        }
    }
}
