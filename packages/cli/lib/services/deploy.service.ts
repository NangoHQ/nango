import chalk from 'chalk';
import promptly from 'promptly';
import type { AxiosResponse } from 'axios';
import { AxiosError } from 'axios';
import type { SyncType, SyncDeploymentResult, StandardNangoConfig, IncomingFlowConfig, NangoConfigMetadata } from '@nangohq/shared';
import type { PostConnectionScriptByProvider } from '@nangohq/types';
import { SyncConfigType, localFileService, getInterval, stagingHost, cloudHost } from '@nangohq/shared';
import configService from './config.service.js';
import { compileAllFiles } from './compile.service.js';
import verificationService from './verification.service.js';
import { printDebug, parseSecretKey, port, enrichHeaders, http, getPkgVersion } from '../utils.js';
import type { DeployOptions } from '../types.js';

class DeployService {
    public async admin(environmentName: string, debug = false): Promise<void> {
        await verificationService.necessaryFilesExist(false);

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

        const successfulCompile = await compileAllFiles({ debug });

        if (!successfulCompile) {
            console.log(chalk.red('Compilation was not fully successful. Please make sure all files compile before deploying'));
            process.exit(1);
        }

        const { success, error, response: config } = await configService.load('', debug);

        if (!success || !config) {
            console.log(chalk.red(error?.message));
            return;
        }

        const flowData = this.package(config, debug);

        if (!flowData) {
            return;
        }

        const targetAccountUUID = await promptly.prompt('Input the account uuid to deploy to: ');

        if (!targetAccountUUID) {
            console.log(chalk.red('Account uuid is required. Exiting'));
            return;
        }

        const url = process.env['NANGO_HOSTPORT'] + `/admin/flow/deploy/pre-built`;

        const nangoYamlBody = localFileService.getNangoYamlFileContents('./');

        try {
            await http
                .post(url, { targetAccountUUID, targetEnvironment: environmentName, config: flowData, nangoYamlBody }, { headers: enrichHeaders() })
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

    public async prep(options: DeployOptions, environment: string, debug = false) {
        const { env, version, sync: optionalSyncName, action: optionalActionName, autoConfirm } = options;
        await verificationService.necessaryFilesExist(autoConfirm);

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

        const singleDeployMode = Boolean(optionalSyncName || optionalActionName);

        const successfulCompile = await compileAllFiles({ debug });

        if (!successfulCompile) {
            console.log(chalk.red('Compilation was not fully successful. Please make sure all files compile before deploying'));
            process.exit(1);
        }

        const { success, error, response: config } = await configService.load('', debug);

        if (!success || !config) {
            console.log(chalk.red(error?.message));
            return;
        }

        const postData = this.package(config, debug, version, optionalSyncName, optionalActionName);

        if (!postData) {
            return;
        }

        const { flowConfigs, postConnectionScriptsByProvider } = postData;

        const url = process.env['NANGO_HOSTPORT'] + `/scripts/deploy`;
        const nangoYamlBody = localFileService.getNangoYamlFileContents('./');

        if (process.env['NANGO_DEPLOY_AUTO_CONFIRM'] !== 'true' && !autoConfirm) {
            const confirmationUrl = process.env['NANGO_HOSTPORT'] + `/scripts/deploy/confirmation`;
            try {
                const response = await http.post(
                    confirmationUrl,
                    { flowConfigs, postConnectionScriptsByProvider, reconcile: false, debug, singleDeployMode },
                    { headers: enrichHeaders() }
                );
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
                if (confirmation) {
                    await this.run(url, { flowConfigs, postConnectionScriptsByProvider, nangoYamlBody, reconcile: true, debug, singleDeployMode });
                } else {
                    console.log(chalk.red('Syncs/Actions were not deployed. Exiting'));
                    process.exit(0);
                }
            } catch (err: any) {
                if (err?.response?.data?.error) {
                    console.log(chalk.red(err.response.data.error));
                    process.exit(1);
                }
                let errorMessage;
                if (err instanceof AxiosError) {
                    const errorObject = { message: err.message, stack: err.stack, code: err.code, status: err.status, url, method: err.config?.method };
                    errorMessage = JSON.stringify(errorObject, null, 2);
                } else {
                    errorMessage = JSON.stringify(err, null, 2);
                }
                console.log(chalk.red(`Error deploying the syncs/actions with the following error: ${errorMessage}`));
                process.exit(1);
            }
        } else {
            if (debug) {
                printDebug(`Auto confirm is set so deploy will start without confirmation`);
            }
            await this.run(url, { flowConfigs, postConnectionScriptsByProvider, nangoYamlBody, reconcile: true, debug, singleDeployMode });
        }
    }

    public async run(
        url: string,
        body: {
            flowConfigs: IncomingFlowConfig[];
            postConnectionScriptsByProvider: PostConnectionScriptByProvider[];
            nangoYamlBody: string | null;
            reconcile: boolean;
            debug: boolean;
            singleDeployMode?: boolean;
        }
    ) {
        await http
            .post(url, body, { headers: enrichHeaders() })
            .then((response: AxiosResponse<SyncDeploymentResult[]>) => {
                const results = response.data;
                if (results.length === 0) {
                    console.log(chalk.green(`Successfully removed the syncs/actions.`));
                } else {
                    const nameAndVersions = results.map((result) => `${result.sync_name || result.name}@v${result.version}`);
                    console.log(chalk.green(`Successfully deployed the syncs/actions: ${nameAndVersions.join(', ')}!`));
                }
            })
            .catch((err: unknown) => {
                const errorMessage =
                    err instanceof AxiosError ? JSON.stringify(err.response?.data, null, 2) : JSON.stringify(err, ['message', 'name', 'stack'], 2);
                console.log(chalk.red(`Error deploying the syncs/actions with the following error: ${errorMessage}`));
                process.exit(1);
            });
    }

    public package(
        config: StandardNangoConfig[],
        debug: boolean,
        version = '',
        optionalSyncName = '',
        optionalActionName = ''
    ): { flowConfigs: IncomingFlowConfig[]; postConnectionScriptsByProvider: PostConnectionScriptByProvider[] } | null {
        const postData: IncomingFlowConfig[] = [];
        const postConnectionScriptsByProvider: PostConnectionScriptByProvider[] = [];

        for (const integration of config) {
            const { providerConfigKey, postConnectionScripts } = integration;
            let { syncs, actions } = integration;

            if (postConnectionScripts && postConnectionScripts.length > 0) {
                postConnectionScriptsByProvider.push({
                    providerConfigKey,
                    scripts: postConnectionScripts.map((name) => {
                        return {
                            name,
                            fileBody: {
                                js: localFileService.getIntegrationFile(name, providerConfigKey, './') as string,
                                ts: localFileService.getIntegrationTsFile(name, providerConfigKey, 'post-connection-script') as string
                            }
                        };
                    })
                });
            }

            let flows = [...syncs, ...actions];

            if (optionalSyncName) {
                syncs = syncs.filter((sync) => sync.name === optionalSyncName);
                flows = syncs;
            }

            if (optionalActionName) {
                actions = actions.filter((action) => action.name === optionalActionName);
                flows = actions;
            }

            if (optionalSyncName && optionalActionName) {
                flows = [...syncs, ...actions];
            }

            for (const flow of flows) {
                const { name: syncName, runs = '', returns: models, models: model_schema, type = SyncConfigType.SYNC } = flow;

                const { path: integrationFilePath, result: integrationFileResult } = localFileService.checkForIntegrationDistFile(
                    syncName,
                    providerConfigKey,
                    './'
                );

                const metadata = {} as NangoConfigMetadata;

                if (flow.description) {
                    metadata['description'] = flow.description;
                }

                if (flow.scopes) {
                    metadata['scopes'] = flow.scopes;
                }

                if (!integrationFileResult) {
                    console.log(chalk.red(`No integration file found for ${syncName} at ${integrationFilePath}. Skipping...`));
                    continue;
                }

                if (type !== SyncConfigType.SYNC && type !== SyncConfigType.ACTION) {
                    console.log(
                        chalk.red(
                            `The sync ${syncName} has an invalid type "${type}". The type must be either ${SyncConfigType.SYNC} or${SyncConfigType.ACTION}. Skipping...`
                        )
                    );
                }
                if (type === SyncConfigType.SYNC && !runs) {
                    console.log(chalk.red(`The sync ${syncName} is missing the "runs" property. Skipping...`));
                    continue;
                }

                if (runs && type === SyncConfigType.SYNC) {
                    const { success, error } = getInterval(runs, new Date());

                    if (!success) {
                        console.log(chalk.red(`The sync ${syncName} has an issue with the sync interval "${runs}": ${error?.message}`));

                        return null;
                    }
                }

                if (debug) {
                    printDebug(`Integration file found for ${syncName} at ${integrationFilePath}`);
                }

                if (flow.input?.fields) {
                    model_schema.push(flow.input);
                }

                const body = {
                    syncName,
                    providerConfigKey,
                    models: Array.isArray(models) ? models : [models],
                    version: version,
                    runs,
                    track_deletes: flow.track_deletes || false,
                    auto_start: flow.auto_start === false ? false : true,
                    attributes: flow.attributes || {},
                    metadata: metadata || {},
                    input: flow.input?.name || '',
                    sync_type: flow.sync_type as SyncType,
                    type,
                    fileBody: {
                        js: localFileService.getIntegrationFile(syncName, providerConfigKey, './') as string,
                        ts: localFileService.getIntegrationTsFile(syncName, providerConfigKey, type) as string
                    },
                    model_schema: JSON.stringify(model_schema),
                    endpoints: flow.endpoints,
                    webhookSubscriptions: flow.webhookSubscriptions || [],
                    cli_version: getPkgVersion()
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

        return { flowConfigs: postData, postConnectionScriptsByProvider };
    }
}

const deployService = new DeployService();
export default deployService;
