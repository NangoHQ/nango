/* eslint-disable no-console */
import promptly from 'promptly';
import fs from 'node:fs';
import { AxiosError } from 'axios';
import type { AxiosResponse } from 'axios';
import chalk from 'chalk';

import type { DBSyncConfig, Metadata, NangoProps, ParsedNangoAction, ParsedNangoSync, ScriptFileType } from '@nangohq/types';
import type { GlobalOptions } from '../types.js';
import { parseSecretKey, printDebug, hostport, getConnection, getConfig } from '../utils.js';
import { compileAllFiles } from './compile.service.js';
import { parse } from './config.service.js';
import { loadSchemaJson } from './model.service.js';
import { displayValidationError } from '../utils/errors.js';
import * as responseSaver from './response-saver.service.js';
import * as vm from 'node:vm';
import * as url from 'url';
import * as crypto from 'crypto';
import * as zod from 'zod';
import { Buffer } from 'buffer';
import { serializeError } from 'serialize-error';
import { ActionError, InvalidActionInputSDKError, InvalidActionOutputSDKError, SDKError, validateData } from '@nangohq/runner-sdk';
import { NangoActionCLI, NangoSyncCLI } from './sdk.js';

interface RunArgs extends GlobalOptions {
    sync: string;
    connectionId: string;
    lastSyncDate?: string;
    useServerLastSyncDate?: boolean;
    input?: unknown;
    metadata?: Metadata;
    optionalEnvironment?: string;
    optionalProviderConfigKey?: string;
    saveResponses?: boolean;
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

        const parsing = parse(process.cwd(), debug);
        if (parsing.isErr()) {
            console.log(chalk.red(parsing.error.message));
            return;
        }

        const parser = parsing.value;
        if (options.optionalProviderConfigKey && !parser.parsed!.integrations.some((inte) => inte.providerConfigKey === options.optionalProviderConfigKey)) {
            console.log(chalk.red(`Integration "${options.optionalProviderConfigKey}" does not exist`));
            return;
        }

        let providerConfigKey: string | undefined;
        let isOnEventScript = false;

        // Find the appropriate script to run
        let scriptInfo: ParsedNangoSync | ParsedNangoAction | undefined;
        for (const integration of parser.parsed!.integrations) {
            if (options.optionalProviderConfigKey && integration.providerConfigKey !== options.optionalProviderConfigKey) {
                continue;
            }

            // Priority for syncs and actions
            for (const script of [...integration.syncs, ...integration.actions]) {
                if (script.name !== syncName) {
                    continue;
                }
                if (scriptInfo) {
                    console.log(chalk.red(`Multiple integrations contain a script named "${syncName}". Please use "--integration-id"`));
                    return;
                }
                scriptInfo = script;
                providerConfigKey = integration.providerConfigKey;
            }

            // If nothing that could still be a on-event script
            if (!scriptInfo) {
                for (const script of Object.values(integration.onEventScripts).flat()) {
                    if (script !== syncName) {
                        continue;
                    }
                    if (isOnEventScript) {
                        console.log(chalk.red(`Multiple integrations contain a post connection script named "${syncName}". Please use "--integration-id"`));
                        return;
                    }
                    isOnEventScript = true;
                    providerConfigKey = integration.providerConfigKey;
                }
            }
        }

        if ((!scriptInfo && !isOnEventScript) || !providerConfigKey) {
            console.log(
                chalk.red(
                    `No script matched "${syncName}"${options.optionalProviderConfigKey ? ` for integration "${options.optionalProviderConfigKey}"` : ''}`
                )
            );
            return;
        }

        if (debug && scriptInfo) {
            printDebug(`Found integration ${providerConfigKey}, ${scriptInfo.type} ${scriptInfo.name} `);
        }

        const nangoConnection = await getConnection(
            providerConfigKey,
            connectionId,
            {
                'Nango-Is-Sync': true,
                'Nango-Is-Dry-Run': true
            },
            debug
        );
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

        if (process.env['NANGO_HOSTPORT']?.endsWith('.nango.dev')) {
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
        if (scriptInfo?.type === 'action') {
            type = 'actions';
        } else if (isOnEventScript) {
            type = 'on-events';
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
                const fileContents = readFile(actionInput.toString());
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

            if (options.saveResponses) {
                const responseDirectoryPrefix = process.env['NANGO_MOCKS_RESPONSE_DIRECTORY'] ?? '';
                const directoryName = `${responseDirectoryPrefix}${providerConfigKey}`;
                responseSaver.ensureDirectoryExists(`${directoryName}/mocks/${syncName}`);
                const filePath = `${directoryName}/mocks/${syncName}/input.json`;
                const dataToWrite = typeof normalizedInput === 'object' ? JSON.stringify(normalizedInput, null, 2) : normalizedInput;
                fs.writeFileSync(filePath, dataToWrite);
            }
        }

        if (rawStubbedMetadata) {
            if (rawStubbedMetadata.toString().includes('@') && rawStubbedMetadata.toString().endsWith('.json')) {
                const fileContents = readFile(rawStubbedMetadata.toString());
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

        const jsonSchema = loadSchemaJson({ fullPath: this.fullPath });
        if (!jsonSchema) {
            console.log(chalk.red('Failed to load schema.json'));
            return;
        }

        try {
            const syncConfig: DBSyncConfig = {
                id: -1,
                sync_name: syncName,
                file_location: '',
                models: scriptInfo?.output || [],
                input: scriptInfo?.input || null,
                track_deletes: false,
                type: scriptInfo?.type || 'sync',
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
                updated_at: new Date(),
                attributes: {},
                is_public: false,
                metadata: {},
                pre_built: false,
                sync_type: lastSyncDate ? 'incremental' : 'full',
                version: '0.0.1'
            };
            const nangoProps: NangoProps = {
                scriptType: scriptInfo?.type || 'sync',
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
                syncConfig,
                debug,
                runnerFlags: {
                    validateActionInput: this.validation, // irrelevant for cli
                    validateActionOutput: this.validation, // irrelevant for cli
                    validateSyncRecords: this.validation,
                    validateSyncMetadata: false
                },
                startedAt: new Date(),
                endUser: null
            };
            if (options.saveResponses) {
                nangoProps.axios = {
                    response: {
                        onFulfilled: (response: AxiosResponse) =>
                            responseSaver.onAxiosRequestFulfilled({ response, providerConfigKey, connectionId: nangoConnection.connection_id, syncName }),
                        onRejected: (error: unknown) =>
                            responseSaver.onAxiosRequestRejected({ error, providerConfigKey, connectionId: nangoConnection.connection_id, syncName })
                    }
                };
            }
            console.log('---');
            const results = await this.runScript({
                syncName,
                nangoProps,
                loadLocation: './',
                input: normalizedInput,
                stubbedMetadata: stubbedMetadata
            });
            console.log('---');

            if (results.error) {
                const err = results.error;
                console.error(chalk.red('An error occurred during execution'));
                if (err instanceof SDKError) {
                    console.error(chalk.red(err.message), chalk.gray(`(${err.code})`));
                    if (err.code === 'invalid_action_output' || err.code === 'invalid_action_input' || err.code === 'invalid_sync_record') {
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
                    console.log(JSON.stringify(results.response.output, null, 2));
                    if (options.saveResponses) {
                        const responseDirectoryPrefix = process.env['NANGO_MOCKS_RESPONSE_DIRECTORY'] ?? '';
                        const directoryName = `${responseDirectoryPrefix}${providerConfigKey}`;
                        responseSaver.ensureDirectoryExists(`${directoryName}/mocks/${syncName}`);
                        const filePath = `${directoryName}/mocks/${syncName}/output.json`;
                        fs.writeFileSync(filePath, JSON.stringify(results.response, null, 2));
                    }
                    resultOutput.push(JSON.stringify(results.response, null, 2));
                }
            }

            const logMessages = results.response?.nango && results.response.nango instanceof NangoSyncCLI && results.response.nango.logMessages;
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
                    const confirmation = options.autoConfirm
                        ? true
                        : await promptly.confirm(`There are ${remaining} logs messages remaining. Would you like to see the next 10 log messages? (y/n)`);
                    if (confirmation) {
                        displayBatch();
                    } else {
                        break;
                    }
                }

                if (options.saveResponses && results.response?.nango && results.response?.nango instanceof NangoSyncCLI) {
                    const responseDirectoryPrefix = process.env['NANGO_MOCKS_RESPONSE_DIRECTORY'] ?? '';
                    const directoryName = `${responseDirectoryPrefix}${providerConfigKey}`;
                    const nango = results.response.nango;
                    if (scriptInfo?.output) {
                        for (const model of scriptInfo.output) {
                            responseSaver.ensureDirectoryExists(`${directoryName}/mocks/${syncName}/${model}`);
                            {
                                const filePath = `${directoryName}/mocks/${syncName}/${model}/batchSave.json`;
                                const modelData = nango.rawSaveOutput.get(model) || [];
                                fs.writeFileSync(filePath, JSON.stringify(modelData, null, 2));
                            }

                            {
                                const filePath = `${directoryName}/mocks/${syncName}/${model}/batchDelete.json`;
                                const modelData = nango.rawDeleteOutput.get(model) || [];
                                fs.writeFileSync(filePath, JSON.stringify(modelData, null, 2));
                            }
                        }
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

    async runScript({
        syncName,
        nangoProps,
        loadLocation,
        input,
        stubbedMetadata
    }: {
        syncName: string;
        nangoProps: NangoProps;
        loadLocation: string;
        input: object;
        stubbedMetadata?: Metadata;
    }): Promise<
        { success: false; error: any; response: null } | { success: true; error: null; response: { output: any; nango: NangoSyncCLI | NangoActionCLI } }
    > {
        const drs = new DryRunService({ environment: nangoProps.environmentName!, returnOutput: true, fullPath: this.fullPath, validation: this.validation });
        const nango =
            nangoProps.scriptType === 'sync' || nangoProps.scriptType === 'webhook'
                ? new NangoSyncCLI(nangoProps, { dryRunService: drs, stubbedMetadata })
                : new NangoActionCLI(nangoProps, { dryRunService: drs });

        try {
            nango.log(`Executing -> integration:"${nangoProps.provider}" script:"${syncName}"`);

            const script = getIntegrationFile(syncName, nangoProps.providerConfigKey, loadLocation);
            const isAction = nangoProps.scriptType === 'action';

            if (!script) {
                const content = `Unable to find script file for "${syncName}"`;
                return { success: false, error: new Error(content), response: null };
            }

            const filename = `${syncName}-${nangoProps.providerConfigKey}.js`;
            try {
                const wrappedCode = `(function() { var module = { exports: {} }; var exports = module.exports; ${script}
                    return module.exports;
                })();
                `;

                const scriptObj = new vm.Script(wrappedCode, {
                    filename
                });
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
                            case 'soap':
                            case 'botbuilder':
                                throw new Error(`Module '${moduleName}' not available in dry run. Please test the integration using the Nango dashboard`);
                            default:
                                throw new Error(`Module '${moduleName}' is not allowed`);
                        }
                    },
                    Buffer,
                    setTimeout,
                    Error,
                    URL,
                    URLSearchParams
                };

                const context = vm.createContext(sandbox);
                const scriptExports: any = scriptObj.runInContext(context);

                if (!scriptExports.default || !(typeof scriptExports.default === 'function')) {
                    const content = `There is no default export that is a function for ${syncName}`;
                    return { success: false, error: new Error(content), response: null };
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
                        nango.log('Invalid action input. Use `--validation` option to see the details', { level: 'warn' });
                        if (nangoProps.runnerFlags.validateActionInput) {
                            return {
                                success: false,
                                response: null,
                                error: new InvalidActionInputSDKError({ data: input, validation: valInput, model: nangoProps.syncConfig.input })
                            };
                        }
                    }

                    const output = await scriptExports.default(nango, input);

                    // Validate action output against json schema
                    const modelNameOutput =
                        nangoProps.syncConfig.models && nangoProps.syncConfig.models.length > 0 ? nangoProps.syncConfig.models[0] : undefined;
                    const valOutput = validateData({
                        version: nangoProps.syncConfig.version || '1',
                        input: output,
                        modelName: modelNameOutput,
                        jsonSchema: nangoProps.syncConfig.models_json_schema
                    });
                    if (Array.isArray(valOutput)) {
                        nango.log('Invalid action output. Use `--validation` option to see the details', { level: 'warn' });
                        if (nangoProps.runnerFlags.validateActionOutput) {
                            return {
                                success: false,
                                response: null,
                                error: new InvalidActionOutputSDKError({ data: output, validation: valOutput, model: modelNameOutput })
                            };
                        }
                    }

                    return { success: true, error: null, response: { output, nango } };
                }

                const results = await scriptExports.default(nango);
                return { success: true, error: null, response: { output: results, nango } };
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
                } else if (err instanceof AxiosError) {
                    if (err.response?.data) {
                        const errorResponse = err.response.data.payload || err.response.data;
                        return {
                            success: false,
                            error: {
                                type: 'script_http_error',
                                payload: typeof errorResponse === 'string' ? { message: errorResponse } : errorResponse,
                                status: err.response.status
                            },
                            response: null
                        };
                    } else {
                        const tmp = serializeError(err);
                        return {
                            success: false,
                            error: {
                                type: 'script_http_error',
                                payload: { name: tmp.name || 'Error', code: tmp.code, message: tmp.message },
                                status: 500
                            },
                            response: null
                        };
                    }
                } else {
                    const tmp = serializeError(!err || typeof err !== 'object' ? new Error(JSON.stringify(err)) : err);

                    const stacktrace = tmp.stack
                        ? tmp.stack
                              .split('\n')
                              .filter((s, i) => i === 0 || s.includes(filename))
                              .map((s) => s.trim())
                              .slice(0, 5) // max 5 lines
                        : [];

                    return {
                        success: false,
                        error: {
                            type: 'script_internal_error',
                            payload: { name: tmp.name || 'Error', code: tmp.code, message: tmp.message },
                            ...(stacktrace.length > 0 ? { stacktrace } : {}),
                            status: 500
                        },
                        response: null
                    };
                }
            }
        } catch (err) {
            const errorMessage = JSON.stringify(err, ['message', 'name', 'stack'], 2);
            const content = `The script failed to load for ${syncName} with the following error`;

            return { success: false, error: new Error(content, { cause: errorMessage }), response: null };
        } finally {
            nango.log(`Done`);
        }
    }
}

function readFile(rawFilePath: string): string | null {
    try {
        const filePath = rawFilePath.replace('@', '');
        const realPath = fs.realpathSync(filePath);
        const fileContents = fs.readFileSync(realPath, 'utf8');

        return fileContents;
    } catch (err) {
        console.log(err);
        return null;
    }
}

function getIntegrationFile(syncName: string, providerConfigKey: string, location: string): string | null {
    try {
        const filePath = `${location}dist/${syncName}.js`;
        const fileNameWithProviderConfigKey = filePath.replace(`.js`, `-${providerConfigKey}.js`);

        let realPath;
        if (fs.existsSync(fileNameWithProviderConfigKey)) {
            realPath = fs.realpathSync(fileNameWithProviderConfigKey);
        } else {
            realPath = fs.realpathSync(filePath);
        }
        const integrationFileContents = fs.readFileSync(realPath, 'utf8');

        return integrationFileContents;
    } catch (err) {
        console.log(err);
        return null;
    }
}
