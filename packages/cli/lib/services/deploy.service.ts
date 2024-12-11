import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import promptly from 'promptly';
import type { AxiosResponse } from 'axios';
import { AxiosError } from 'axios';
import type {
    NangoYamlParsed,
    OnEventScriptsByProvider,
    ScriptFileType,
    IncomingFlowConfig,
    NangoConfigMetadata,
    PostDeploy,
    PostDeployInternal,
    PostDeployConfirmation,
    OnEventType
} from '@nangohq/types';
import { compileSingleFile, compileAllFiles, resolveTsFileLocation, getFileToCompile } from './compile.service.js';

import verificationService from './verification.service.js';
import { printDebug, parseSecretKey, enrichHeaders, http, isCI } from '../utils.js';
import type { DeployOptions, InternalDeployOptions } from '../types.js';
import { parse } from './config.service.js';
import type { JSONSchema7 } from 'json-schema';
import { loadSchemaJson } from './model.service.js';
import { cloudHost, localhostUrl } from '../constants.js';

class DeployService {
    public async admin({ fullPath, environmentName, debug = false }: { fullPath: string; environmentName: string; debug?: boolean }): Promise<void> {
        await verificationService.necessaryFilesExist({ fullPath, autoConfirm: false });

        await parseSecretKey(environmentName, debug);

        if (!process.env['NANGO_HOSTPORT']) {
            switch (environmentName) {
                case 'local':
                    process.env['NANGO_HOSTPORT'] = localhostUrl;
                    break;
                default:
                    process.env['NANGO_HOSTPORT'] = cloudHost;
                    break;
            }
        }

        if (debug) {
            printDebug(`NANGO_HOSTPORT is set to ${process.env['NANGO_HOSTPORT']}.`);
            printDebug(`Environment is set to ${environmentName}`);
        }

        const successfulCompile = await compileAllFiles({ fullPath, debug });

        if (!successfulCompile) {
            console.log(chalk.red('Compilation was not fully successful. Please make sure all files compile before deploying'));
            process.exit(1);
        }

        const parsing = parse(fullPath, debug);
        if (parsing.isErr()) {
            console.log(chalk.red(parsing.error.message));
            return;
        }

        const parser = parsing.value;
        const flowData = this.package({ parsed: parser.parsed!, fullPath, debug });

        if (!flowData) {
            return;
        }

        const targetAccountUUID = await promptly.prompt('Input the account uuid to deploy to: ');

        if (!targetAccountUUID) {
            console.log(chalk.red('Account uuid is required. Exiting'));
            return;
        }

        const url = process.env['NANGO_HOSTPORT'] + `/admin/flow/deploy/pre-built`;

        try {
            await http
                .post(
                    url,
                    { targetAccountUUID, targetEnvironment: environmentName, parsed: flowData, nangoYamlBody: parser.yaml },
                    { headers: enrichHeaders() }
                )
                .then(() => {
                    console.log(chalk.green(`Successfully deployed the syncs/actions to the users account.`));
                })
                .catch((err: unknown) => {
                    const errorMessage = JSON.stringify(err instanceof AxiosError ? err.response?.data : err, null, 2);
                    console.log(chalk.red(`Error deploying the syncs/actions with the following error: ${errorMessage}`));
                    process.exit(1);
                });
        } catch (err) {
            console.error(err);
        }
    }

    public async prep({ fullPath, options, environment, debug = false }: { fullPath: string; options: DeployOptions; environment: string; debug?: boolean }) {
        const { env, version, sync: optionalSyncName, action: optionalActionName, autoConfirm, allowDestructive } = options;
        await verificationService.necessaryFilesExist({ fullPath, autoConfirm, checkDist: false });

        await parseSecretKey(environment, debug);

        if (!process.env['NANGO_HOSTPORT']) {
            switch (env) {
                case 'local':
                    process.env['NANGO_HOSTPORT'] = localhostUrl;
                    break;
                default:
                    process.env['NANGO_HOSTPORT'] = cloudHost;
                    break;
            }
        }

        if (debug) {
            printDebug(`NANGO_HOSTPORT is set to ${process.env['NANGO_HOSTPORT']}.`);
            printDebug(`Environment is set to ${environment}`);
        }

        const parsing = parse(fullPath, debug);
        if (parsing.isErr()) {
            console.log(chalk.red(parsing.error.message));
            return;
        }

        const parser = parsing.value;
        const singleDeployMode = Boolean(optionalSyncName || optionalActionName);

        let successfulCompile = false;

        if (singleDeployMode) {
            const scriptName: string = String(optionalSyncName || optionalActionName);
            const type = optionalSyncName ? 'syncs' : 'actions';
            const providerConfigKey = parser.parsed!.integrations.find((integration) => {
                if (optionalSyncName) {
                    return integration.syncs.find((sync) => sync.name === scriptName);
                } else {
                    return integration.actions.find((action) => action.name === scriptName);
                }
            })?.providerConfigKey;

            if (providerConfigKey) {
                const parentFilePath = resolveTsFileLocation({ fullPath, scriptName, providerConfigKey, type });
                successfulCompile = await compileSingleFile({
                    fullPath,
                    file: getFileToCompile({
                        fullPath,
                        filePath: path.join(parentFilePath, `${scriptName}.ts`)
                    }),
                    parsed: parser.parsed!,
                    debug
                });
            }
        } else {
            successfulCompile = await compileAllFiles({ fullPath, debug });
        }

        if (!successfulCompile) {
            console.log(chalk.red('Compilation was not fully successful. Please make sure all files compile before deploying'));
            process.exit(1);
        }

        const postData = this.package({ parsed: parser.parsed!, fullPath, debug, version, optionalSyncName, optionalActionName });
        if (!postData) {
            return;
        }

        const nangoYamlBody = parser.yaml;

        const url = process.env['NANGO_HOSTPORT'] + `/sync/deploy`;
        const bodyDeploy: PostDeploy['Body'] = { ...postData, reconcile: true, debug, nangoYamlBody, singleDeployMode };

        const shouldConfirm = process.env['NANGO_DEPLOY_AUTO_CONFIRM'] !== 'true' && !autoConfirm;
        const confirmationUrl = process.env['NANGO_HOSTPORT'] + `/sync/deploy/confirmation`;

        try {
            const bodyConfirmation: PostDeployConfirmation['Body'] = { ...postData, reconcile: false, debug, singleDeployMode };
            const response = await http.post(confirmationUrl, bodyConfirmation, { headers: enrichHeaders() });

            if (shouldConfirm) {
                // Show response in term
                console.log(JSON.stringify(response.data, null, 2));
            }

            const { newSyncs, deletedSyncs, deletedModels } = response.data;

            for (const sync of newSyncs) {
                const syncMessage =
                    sync.connections === 0 || sync.auto_start === false
                        ? 'The sync will be added to your Nango instance if you deploy.'
                        : `Nango will start syncing the corresponding data for ${sync.connections} existing connections.`;
                console.log(chalk.yellow(`Sync "${sync.name}" is new. ${syncMessage}`));
            }

            let deletedSyncsConnectionsCount = 0;
            for (const sync of deletedSyncs) {
                console.log(
                    chalk.red(
                        `Sync "${sync.name}" has been removed. It will stop running and the corresponding data will be deleted for ${sync.connections} existing connections.`
                    )
                );
                deletedSyncsConnectionsCount += sync.connections;
            }

            if (deletedModels.length > 0) {
                console.log(
                    chalk.red(
                        `The following models have been removed: ${deletedModels.join(', ')}. WARNING: Renaming a model is the equivalent of deleting the old model and creating a new one. Records from the old model won't be transferred to the new model. Consider running a full sync to transfer records.`
                    )
                );
            }

            // force confirmation :
            // - if auto-confirm flag is not set
            // - OR if there are deleted syncs with connections (and allow-destructive flag is not set)
            // - OR if there are deleted models (and allow-destructive flag is not set)
            // If CI, fail the deploy
            const shouldConfirmDestructive = (deletedSyncsConnectionsCount > 0 || deletedModels.length > 0) && !allowDestructive;
            if (shouldConfirm || shouldConfirmDestructive) {
                let confirmationMsg = `Are you sure you want to continue y/n?`;
                if (!shouldConfirm && shouldConfirmDestructive) {
                    confirmationMsg += ' (set --allow-destructive flag to skip this confirmation)';
                }
                if (isCI) {
                    console.log(
                        chalk.red(
                            `Syncs/Actions were not deployed. Confirm the deploy by passing the --auto-confirm flag${shouldConfirmDestructive ? ' and --allow-destructive flag' : ''}. Exiting`
                        )
                    );
                    process.exit(1);
                }
                const confirmation = await promptly.confirm(confirmationMsg);
                if (!confirmation) {
                    console.log(chalk.red('Syncs/Actions were not deployed. Exiting'));
                    process.exit(0);
                }
            } else {
                if (debug) {
                    const flags: string[] = [];
                    if (!shouldConfirm) {
                        flags.push('Auto confirm flag');
                    }
                    if (!shouldConfirmDestructive) {
                        flags.push('Allow destructive flag');
                    }
                    printDebug(`${flags.join(' and ')} ${flags.length > 1 ? 'are' : 'is'} set, so deploy will start without confirmation`);
                }
            }
        } catch (err: any) {
            console.log(chalk.red(`Error deploying the syncs/actions with the following error`));

            let errorObject = err;
            if (err instanceof AxiosError) {
                if (err.response?.data?.error) {
                    errorObject = err.response.data.error;
                } else {
                    errorObject = { message: err.message, stack: err.stack, code: err.code, status: err.status, url, method: err.config?.method };
                }
            }

            console.log(chalk.red(JSON.stringify(errorObject, null, 2)));
            process.exit(1);
        }

        await this.deploy(url, bodyDeploy);
    }

    public async deploy(url: string, body: PostDeploy['Body']) {
        await http
            .post(url, body, { headers: enrichHeaders() })
            .then((response: AxiosResponse<PostDeploy['Success']>) => {
                const results = response.data;
                if (results.length === 0) {
                    console.log(chalk.green(`Successfully removed the syncs/actions.`));
                } else {
                    const nameAndVersions = results.map((result) => `${result.sync_name || result.name}@v${result.version}`);
                    console.log(chalk.green(`Successfully deployed the scripts: ${nameAndVersions.join(', ')}!`));
                }
            })
            .catch((err: unknown) => {
                const errorMessage =
                    err instanceof AxiosError ? JSON.stringify(err.response?.data, null, 2) : JSON.stringify(err, ['message', 'name', 'stack'], 2);
                console.log(chalk.red(`Error deploying the scripts with the following error: ${errorMessage}`));
                process.exit(1);
            });
    }

    public async internalDeploy({
        fullPath,
        environment,
        options,
        debug = false
    }: {
        fullPath: string;
        environment: string;
        options: InternalDeployOptions;
        debug?: boolean;
    }) {
        const { env } = options;
        await verificationService.necessaryFilesExist({ fullPath, autoConfirm: true, checkDist: false });

        await parseSecretKey('dev', debug);

        if (!process.env['NANGO_HOSTPORT']) {
            switch (env) {
                case 'local':
                    process.env['NANGO_HOSTPORT'] = localhostUrl;
                    break;
                default:
                    process.env['NANGO_HOSTPORT'] = cloudHost;
                    break;
            }
        }

        if (debug) {
            printDebug(`NANGO_HOSTPORT is set to ${process.env['NANGO_HOSTPORT']}.`);
            printDebug(`Environment is set to ${environment}`);
        }

        const parsing = parse(fullPath, debug);
        if (parsing.isErr()) {
            console.log(chalk.red(parsing.error.message));
            return;
        }

        const parser = parsing.value;
        const successfulCompile = await compileAllFiles({ fullPath, debug });

        if (!successfulCompile) {
            console.log(chalk.red('Compilation was not fully successful. Please make sure all files compile before deploying'));
            process.exit(1);
        }

        const postData = this.package({ parsed: parser.parsed!, fullPath, debug });
        if (!postData) {
            return;
        }

        const nangoYamlBody = parser.yaml;

        const url = process.env['NANGO_HOSTPORT'] + `/sync/deploy/internal?customEnvironment=${environment}`;

        const bodyDeploy: PostDeployInternal['Body'] = { ...postData, reconcile: true, debug, nangoYamlBody, singleDeployMode: false };

        await this.deploy(url, bodyDeploy);
    }

    public package({
        parsed,
        fullPath,
        debug,
        version = '',
        optionalSyncName,
        optionalActionName
    }: {
        parsed: NangoYamlParsed;
        fullPath: string;
        debug: boolean;
        version?: string | undefined;
        optionalSyncName?: string | undefined;
        optionalActionName?: string | undefined;
    }): { flowConfigs: IncomingFlowConfig[]; onEventScriptsByProvider: OnEventScriptsByProvider[] | undefined; jsonSchema: JSONSchema7 } | null {
        const postData: IncomingFlowConfig[] = [];
        const onEventScriptsByProvider: OnEventScriptsByProvider[] | undefined = optionalActionName || optionalSyncName ? undefined : []; // only load on-event scripts if we're not deploying a single sync or action

        for (const integration of parsed.integrations) {
            const { providerConfigKey, onEventScripts, postConnectionScripts } = integration;

            if (onEventScriptsByProvider) {
                const scripts: OnEventScriptsByProvider['scripts'] = [];
                for (const event of Object.keys(onEventScripts) as OnEventType[]) {
                    for (const scriptName of onEventScripts[event]) {
                        const files = loadScriptFiles({ scriptName: scriptName, providerConfigKey, fullPath, type: 'on-events' });
                        if (!files) {
                            console.log(chalk.red(`No script files found for "${scriptName}"`));
                            return null;
                        }
                        scripts.push({ name: scriptName, fileBody: files, event });
                    }
                }

                // for backward compatibility we also load post-connection-creation scripts
                for (const scriptName of postConnectionScripts || []) {
                    const files = loadScriptFiles({ scriptName: scriptName, providerConfigKey, fullPath, type: 'post-connection-scripts' });
                    if (files) {
                        scripts.push({ name: scriptName, fileBody: files, event: 'post-connection-creation' });
                    }
                }
                if (scripts.length > 0) {
                    onEventScriptsByProvider.push({ providerConfigKey, scripts });
                }
            }

            if (!optionalActionName) {
                for (const sync of integration.syncs) {
                    if (optionalSyncName && optionalSyncName !== sync.name) {
                        continue;
                    }

                    const metadata: NangoConfigMetadata = {};
                    if (sync.description) {
                        metadata['description'] = sync.description;
                    }
                    if (sync.scopes) {
                        metadata['scopes'] = sync.scopes;
                    }

                    const files = loadScriptFiles({ scriptName: sync.name, providerConfigKey, fullPath, type: 'syncs' });
                    if (!files) {
                        console.log(chalk.red(`No script files found for "${sync.name}"`));
                        return null;
                    }
                    if (debug) {
                        printDebug(`Scripts files found for ${sync.name}`);
                    }

                    const body: IncomingFlowConfig = {
                        syncName: sync.name,
                        providerConfigKey,
                        models: sync.output || [],
                        version: version || sync.version,
                        runs: sync.runs,
                        track_deletes: sync.track_deletes,
                        auto_start: sync.auto_start,
                        attributes: {},
                        metadata: metadata,
                        input: sync.input || undefined,
                        sync_type: sync.sync_type,
                        type: sync.type,
                        fileBody: files,
                        model_schema: sync.usedModels.map((name) => parsed.models.get(name)!),
                        endpoints: sync.endpoints,
                        webhookSubscriptions: sync.webhookSubscriptions
                    };

                    postData.push(body);
                }
            }

            if (!optionalSyncName) {
                for (const action of integration.actions) {
                    if (optionalActionName && optionalActionName !== action.name) {
                        continue;
                    }

                    const metadata = {} as NangoConfigMetadata;
                    if (action.description) {
                        metadata['description'] = action.description;
                    }
                    if (action.scopes) {
                        metadata['scopes'] = action.scopes;
                    }

                    const files = loadScriptFiles({ scriptName: action.name, providerConfigKey, fullPath, type: 'actions' });
                    if (!files) {
                        console.log(chalk.red(`No script files found for "${action.name}"`));
                        return null;
                    }
                    if (debug) {
                        printDebug(`Scripts files found for "${action.name}"`);
                    }

                    const body: IncomingFlowConfig = {
                        syncName: action.name,
                        providerConfigKey,
                        models: action.output || [],
                        version: version || action.version,
                        runs: '',
                        metadata: metadata,
                        input: action.input || undefined,
                        type: action.type,
                        fileBody: files,
                        model_schema: action.usedModels.map((name) => parsed.models.get(name)!),
                        endpoints: action.endpoint ? [action.endpoint] : [],
                        track_deletes: false
                    };

                    postData.push(body);
                }
            }
        }

        if (debug && onEventScriptsByProvider) {
            for (const onEventScriptByProvider of onEventScriptsByProvider) {
                const { providerConfigKey, scripts } = onEventScriptByProvider;

                for (const script of scripts) {
                    const { name } = script;

                    printDebug(`on-events script found for ${providerConfigKey} with name ${name}`);
                }
            }
        }

        const jsonSchema = loadSchemaJson({ fullPath });
        if (!jsonSchema) {
            return null;
        }

        return { flowConfigs: postData, onEventScriptsByProvider, jsonSchema };
    }
}

function loadScriptFiles({
    fullPath,
    scriptName,
    providerConfigKey,
    type
}: {
    fullPath: string;
    scriptName: string;
    providerConfigKey: string;
    type: ScriptFileType;
}): { js: string; ts: string } | null {
    const js = loadScriptJsFile({ fullPath, scriptName, providerConfigKey });
    if (!js) {
        return null;
    }
    const ts = loadScriptTsFile({ fullPath, scriptName, providerConfigKey, type });
    if (!ts) {
        return null;
    }

    return { js, ts };
}

function loadScriptJsFile({ scriptName, providerConfigKey, fullPath }: { scriptName: string; providerConfigKey: string; fullPath: string }): string | null {
    const filePath = path.join(fullPath, 'dist', `${scriptName}.js`);
    const fileNameWithProviderConfigKey = filePath.replace(`.js`, `-${providerConfigKey}.js`);

    try {
        let realPath;
        if (fs.existsSync(fileNameWithProviderConfigKey)) {
            realPath = fs.realpathSync(fileNameWithProviderConfigKey);
        } else {
            realPath = fs.realpathSync(filePath);
        }
        const content = fs.readFileSync(realPath, 'utf8');

        return content;
    } catch (err) {
        console.error(chalk.red(`Error loading file ${filePath}`), err instanceof Error ? err.message : err);
        return null;
    }
}

function loadScriptTsFile({
    fullPath,
    scriptName,
    providerConfigKey,
    type
}: {
    fullPath: string;
    scriptName: string;
    providerConfigKey: string;
    type: ScriptFileType;
}): string | null {
    const dir = resolveTsFileLocation({ fullPath, scriptName, providerConfigKey, type });
    const filePath = path.join(dir, `${scriptName}.ts`);
    try {
        const tsIntegrationFileContents = fs.readFileSync(filePath, 'utf8');

        return tsIntegrationFileContents;
    } catch (err) {
        console.error(chalk.red(`Error loading file ${filePath}`), err);
        return null;
    }
}

const deployService = new DeployService();
export default deployService;
