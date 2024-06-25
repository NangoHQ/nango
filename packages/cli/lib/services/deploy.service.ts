import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import promptly from 'promptly';
import type { AxiosResponse } from 'axios';
import { AxiosError } from 'axios';
import type { SyncDeploymentResult } from '@nangohq/shared';
import type {
    NangoYamlParsed,
    PostConnectionScriptByProvider,
    ScriptFileType,
    IncomingFlowConfig,
    NangoConfigMetadata,
    PostDeploy,
    PostDeployConfirmation
} from '@nangohq/types';
import { stagingHost, cloudHost } from '@nangohq/shared';
import { compileAllFiles, resolveTsFileLocation } from './compile.service.js';

import verificationService from './verification.service.js';
import { printDebug, parseSecretKey, port, enrichHeaders, http } from '../utils.js';
import type { DeployOptions } from '../types.js';
import { parse } from './config.service.js';

class DeployService {
    public async admin({ fullPath, environmentName, debug = false }: { fullPath: string; environmentName: string; debug?: boolean }): Promise<void> {
        await verificationService.necessaryFilesExist({ fullPath, autoConfirm: false });

        await parseSecretKey(environmentName, debug);

        if (!process.env['NANGO_HOSTPORT']) {
            switch (environmentName) {
                case 'local':
                    process.env['NANGO_HOSTPORT'] = `http://localhost:${port}`;
                    break;
                case 'staging':
                    process.env['NANGO_HOSTPORT'] = stagingHost;
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

        const { success, error, response } = parse(fullPath, debug);

        if (!success || !response!.parsed) {
            console.log(chalk.red(error?.message));
            return;
        }

        const flowData = this.package({ parsed: response!.parsed, fullPath, debug });

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
                    { targetAccountUUID, targetEnvironment: environmentName, parsed: flowData, nangoYamlBody: response!.yaml },
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
        } catch (e) {
            console.log(e);
        }
    }

    public async prep({ fullPath, options, environment, debug = false }: { fullPath: string; options: DeployOptions; environment: string; debug?: boolean }) {
        const { env, version, sync: optionalSyncName, action: optionalActionName, autoConfirm } = options;
        await verificationService.necessaryFilesExist({ fullPath, autoConfirm, checkDist: false });

        await parseSecretKey(environment, debug);

        if (!process.env['NANGO_HOSTPORT']) {
            switch (env) {
                case 'local':
                    process.env['NANGO_HOSTPORT'] = `http://localhost:${port}`;
                    break;
                case 'staging':
                    process.env['NANGO_HOSTPORT'] = stagingHost;
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

        const { success, error, response } = parse(fullPath, debug);

        if (!success || !response?.parsed) {
            console.log(chalk.red(error?.message));
            return;
        }

        const singleDeployMode = Boolean(optionalSyncName || optionalActionName);

        const successfulCompile = await compileAllFiles({ fullPath, debug });
        if (!successfulCompile) {
            console.log(chalk.red('Compilation was not fully successful. Please make sure all files compile before deploying'));
            process.exit(1);
        }

        const postData = this.package({ parsed: response.parsed, fullPath, debug, version, optionalSyncName, optionalActionName });
        if (!postData) {
            return;
        }

        const { flowConfigs, postConnectionScriptsByProvider } = postData;
        const nangoYamlBody = response.yaml;

        const url = process.env['NANGO_HOSTPORT'] + `/sync/deploy`;
        const bodyDeploy: PostDeploy['Body'] = { flowConfigs, postConnectionScriptsByProvider, reconcile: false, debug, nangoYamlBody, singleDeployMode };

        if (process.env['NANGO_DEPLOY_AUTO_CONFIRM'] !== 'true' && !autoConfirm) {
            const confirmationUrl = process.env['NANGO_HOSTPORT'] + `/sync/deploy/confirmation`;
            try {
                const bodyConfirmation: PostDeployConfirmation['Body'] = {
                    flowConfigs,
                    postConnectionScriptsByProvider,
                    reconcile: false,
                    debug,
                    singleDeployMode
                };
                const response = await http.post(confirmationUrl, bodyConfirmation, { headers: enrichHeaders() });

                // Show response in term
                console.log(JSON.stringify(response.data, null, 2));

                const { newSyncs, deletedSyncs } = response.data;

                for (const sync of newSyncs) {
                    const actionMessage =
                        sync.connections === 0 || sync.auto_start === false
                            ? 'The sync will be added to your Nango instance if you deploy.'
                            : `Nango will start syncing the corresponding data for ${sync.connections} existing connections.`;
                    console.log(chalk.yellow(`Sync "${sync.name}" is new. ${actionMessage}`));
                }

                for (const sync of deletedSyncs) {
                    console.log(
                        chalk.red(
                            `Sync "${sync.name}" has been removed. It will stop running and the corresponding data will be deleted for ${sync.connections} existing connections.`
                        )
                    );
                }

                const confirmation = await promptly.confirm('Do you want to continue y/n?');
                if (!confirmation) {
                    console.log(chalk.red('Syncs/Actions were not deployed. Exiting'));
                    process.exit(0);
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
        } else {
            if (debug) {
                printDebug(`Auto confirm is set so deploy will start without confirmation`);
            }
        }

        await this.deploy(url, bodyDeploy);
    }

    public async deploy(url: string, body: PostDeploy['Body']) {
        await http
            .post(url, body, { headers: enrichHeaders() })
            .then((response: AxiosResponse<SyncDeploymentResult[]>) => {
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
    }): { flowConfigs: IncomingFlowConfig[]; postConnectionScriptsByProvider: PostConnectionScriptByProvider[]; jsonSchema: string } | null {
        const postData: IncomingFlowConfig[] = [];
        const postConnectionScriptsByProvider: PostConnectionScriptByProvider[] = [];

        for (const integration of parsed.integrations) {
            const { providerConfigKey, postConnectionScripts } = integration;

            if (postConnectionScripts && postConnectionScripts.length > 0) {
                const scripts: PostConnectionScriptByProvider['scripts'] = [];
                for (const postConnectionScript of postConnectionScripts) {
                    const files = loadScriptFiles({ scriptName: postConnectionScript, providerConfigKey, fullPath, type: 'post-connection-scripts' });
                    if (!files) {
                        return null;
                    }

                    scripts.push({ name: postConnectionScript, fileBody: files });
                }
                postConnectionScriptsByProvider.push({ providerConfigKey, scripts });
            }

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
                    version: version,
                    runs: sync.runs,
                    track_deletes: sync.track_deletes,
                    auto_start: sync.auto_start,
                    attributes: {},
                    metadata: metadata,
                    input: sync.input || undefined,
                    // sync_type: sync.sync_type as SyncType,
                    type: sync.type as any,
                    fileBody: files,
                    model_schema: JSON.stringify(sync.usedModels.map((name) => parsed.models.get(name))),
                    endpoints: sync.endpoints,
                    webhookSubscriptions: sync.webhookSubscriptions
                };

                postData.push(body);
            }

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
                    version: version,
                    runs: '',
                    metadata: metadata,
                    input: action.input || undefined,
                    // sync_type: sync.sync_type as SyncType,
                    type: action.type as any,
                    fileBody: files,
                    model_schema: JSON.stringify(action.usedModels.map((name) => parsed.models.get(name))),
                    endpoints: action.endpoint ? [action.endpoint] : []
                };

                postData.push(body);
            }
        }

        if (debug && postConnectionScriptsByProvider) {
            for (const postConnectionScriptByProvider of postConnectionScriptsByProvider) {
                const { providerConfigKey, scripts } = postConnectionScriptByProvider;

                for (const script of scripts) {
                    const { name } = script;

                    printDebug(`Post connection script found for ${providerConfigKey} with name ${name}`);
                }
            }
        }

        const jsonSchema = loadSchemaJson({ fullPath });
        if (!jsonSchema) {
            return null;
        }

        return { flowConfigs: postData, postConnectionScriptsByProvider, jsonSchema: jsonSchema };
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
    } catch (error) {
        console.error(chalk.red(`Error loading file ${filePath}`), error);
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
    } catch (error) {
        console.error(chalk.red(`Error loading file ${filePath}`), error);
        return null;
    }
}

function loadSchemaJson({ fullPath }: { fullPath: string }): string | null {
    const filePath = path.join(fullPath, '.nango', 'schema.json');
    try {
        return fs.readFileSync(filePath).toString();
    } catch (error) {
        console.error(chalk.red(`Error loading ${filePath}`), error);
        return null;
    }
}

const deployService = new DeployService();
export default deployService;
