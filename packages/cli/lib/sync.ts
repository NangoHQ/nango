import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import axios, { AxiosResponse } from 'axios';
import yaml from 'js-yaml';
import chalk from 'chalk';
import chokidar from 'chokidar';
import * as tsNode from 'ts-node';
import glob from 'glob';
import ejs from 'ejs';
import * as dotenv from 'dotenv';
import { spawn } from 'child_process';
import parser from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import type { ChildProcess } from 'node:child_process';
import promptly from 'promptly';
import type * as t from '@babel/types';

import type {
    SyncDeploymentResult,
    IncomingSyncConfig,
    NangoConfig,
    Connection as NangoConnection,
    NangoIntegration,
    NangoIntegrationData,
    SimplifiedNangoIntegration
} from '@nangohq/shared';
import {
    getInterval,
    analytics,
    loadSimplifiedConfig,
    cloudHost,
    stagingHost,
    SyncType,
    syncRunService,
    nangoConfigFile,
    checkForIntegrationFile,
    SyncConfigType
} from '@nangohq/shared';
import {
    hostport,
    port,
    httpsAgent,
    verifyNecessaryFiles,
    getConnection,
    NANGO_INTEGRATIONS_NAME,
    buildInterfaces,
    enrichHeaders,
    getNangoRootPath,
    printDebug
} from './utils.js';
import type { DeployOptions, GlobalOptions } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const TYPES_FILE_NAME = 'models.ts';
const NangoSyncTypesFileLocation = 'dist/nango-sync.d.ts';

interface RunArgs extends GlobalOptions {
    sync: string;
    connectionId: string;
    lastSyncDate?: string;
    useServerLastSyncDate?: boolean;
    input?: object;
}

const exampleSyncName = 'github-issue-example';

export const version = (debug: boolean) => {
    if (debug) {
        printDebug('Looking up the version first for a local path first then globally');
    }
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(getNangoRootPath(debug) as string, 'package.json'), 'utf8'));
    const dockerComposeYaml = fs.readFileSync(path.resolve(getNangoRootPath() as string, 'docker/docker-compose.yaml'), 'utf8');
    const dockerCompose = yaml.load(dockerComposeYaml) as any;

    const nangoServerImage = dockerCompose.services['nango-server'].image;
    const nangoWorkerImage = dockerCompose.services['nango-worker'].image;

    const nangoServerVersion = nangoServerImage.split(':').pop();
    const nangoWorkerVersion = nangoWorkerImage.split(':').pop();

    console.log(chalk.green('Nango Server version:'), nangoServerVersion);
    console.log(chalk.green('Nango Worker version:'), nangoWorkerVersion);
    console.log(chalk.green('Nango CLI version:'), packageJson.version);
};

export const generate = async (debug = false, inParentDirectory = false) => {
    const dirPrefix = inParentDirectory ? `./${NANGO_INTEGRATIONS_NAME}` : '.';
    const syncTemplateContents = fs.readFileSync(path.resolve(__dirname, './sync.ejs'), 'utf8');
    const actionTemplateContents = fs.readFileSync(path.resolve(__dirname, './action.ejs'), 'utf8');
    const githubExampleTemplateContents = fs.readFileSync(path.resolve(__dirname, './github.sync.ejs'), 'utf8');

    const configContents = fs.readFileSync(`${dirPrefix}/${nangoConfigFile}`, 'utf8');
    const configData: NangoConfig = yaml.load(configContents) as unknown as NangoConfig;
    const { integrations } = configData;
    const { models } = configData;

    const interfaceDefinitions = buildInterfaces(models, integrations, debug);

    fs.writeFileSync(`${dirPrefix}/${TYPES_FILE_NAME}`, interfaceDefinitions.join('\n'));

    if (debug) {
        printDebug(`Interfaces from the ${nangoConfigFile} file written to ${TYPES_FILE_NAME}`);
    }

    // insert NangoSync types to the bottom of the file
    const typesContent = fs.readFileSync(`${getNangoRootPath()}/${NangoSyncTypesFileLocation}`, 'utf8');
    fs.writeFileSync(`${dirPrefix}/${TYPES_FILE_NAME}`, typesContent, { flag: 'a' });

    if (debug) {
        printDebug(`NangoSync types written to ${TYPES_FILE_NAME}`);
    }

    const allSyncNames: Record<string, boolean> = {};

    for (let i = 0; i < Object.keys(integrations).length; i++) {
        const providerConfigKey = Object.keys(integrations)[i] as string;
        if (debug) {
            printDebug(`Generating ${providerConfigKey} integrations`);
        }
        const syncObject = integrations[providerConfigKey] as unknown as { [key: string]: NangoIntegration };
        const syncNames = Object.keys(syncObject);
        for (let k = 0; k < syncNames.length; k++) {
            const syncName = syncNames[k] as string;

            if (allSyncNames[syncName] === undefined) {
                allSyncNames[syncName] = true;
            } else {
                console.log(chalk.red(`The sync name ${syncName} is duplicated in the ${nangoConfigFile} file. All sync names must be unique.`));
                process.exit(1);
            }

            if (debug) {
                printDebug(`Generating ${syncName} integration`);
            }
            const syncData = syncObject[syncName] as unknown as NangoIntegrationData;

            if (!syncData.returns) {
                console.log(
                    chalk.red(
                        `The ${syncName} integration is missing a returns property for what models the sync returns. Make sure you have "returns" instead of "return"`
                    )
                );
                process.exit(1);
            }

            const { returns: models, type = SyncConfigType.SYNC } = syncData;
            const syncNameCamel = syncName
                .split('-')
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join('');

            let ejsTeamplateContents = '';
            if (syncName === exampleSyncName) {
                ejsTeamplateContents = githubExampleTemplateContents;
            } else {
                ejsTeamplateContents = type === SyncConfigType.SYNC ? syncTemplateContents : actionTemplateContents;
            }
            const rendered = ejs.render(ejsTeamplateContents, {
                syncName: syncNameCamel,
                interfaceFileName: TYPES_FILE_NAME.replace('.ts', ''),
                interfaceNames: models.map((model) => {
                    const singularModel = model?.charAt(model.length - 1) === 's' ? model.slice(0, -1) : model;
                    return `${singularModel.charAt(0).toUpperCase()}${singularModel.slice(1)}`;
                }),
                mappings: models.map((model) => {
                    const singularModel = model.charAt(model.length - 1) === 's' ? model.slice(0, -1) : model;
                    return {
                        name: model,
                        type: `${singularModel.charAt(0).toUpperCase()}${singularModel.slice(1)}`
                    };
                })
            });

            if (!fs.existsSync(`${dirPrefix}/${syncName}.ts`)) {
                fs.writeFileSync(`${dirPrefix}/${syncName}.ts`, rendered);
                if (debug) {
                    printDebug(`Created ${syncName}.ts file`);
                }
            } else {
                if (debug) {
                    printDebug(`${syncName}.ts file already exists, so will not overwrite it.`);
                }
            }
        }
    }

    console.log(chalk.green(`Integration files have been created`));
};

/**
 * Init
 * If we're not currently in the nango-integrations directory create one
 * and create an example nango.yaml file
 */
export const init = async (debug = false) => {
    const data: NangoConfig = {
        integrations: {
            'demo-github-integration': {
                [exampleSyncName]: {
                    type: SyncConfigType.SYNC,
                    runs: 'every half hour',
                    returns: ['GithubIssue']
                }
            }
        },
        models: {
            GithubIssue: {
                id: 'integer',
                owner: 'string',
                repo: 'string',
                issue_number: 'number',
                title: 'string',
                author: 'string',
                author_id: 'string',
                state: 'string',
                date_created: 'date',
                date_last_modified: 'date',
                body: 'string'
            }
        }
    };
    const yamlData = yaml.dump(data);

    // if currently in the nango-integrations directory then don't create another one
    const cwd = process.cwd();
    const currentDirectorySplit = cwd.split('/');
    const currentDirectory = currentDirectorySplit[currentDirectorySplit.length - 1];

    let dirExists = false;
    let inParentDirectory = true;

    if (currentDirectory === NANGO_INTEGRATIONS_NAME) {
        dirExists = true;
        inParentDirectory = false;
        if (debug) {
            printDebug(`Currently in the ${NANGO_INTEGRATIONS_NAME} directory so the directory will not be created`);
        }
    }

    if (fs.existsSync(`./${NANGO_INTEGRATIONS_NAME}`)) {
        dirExists = true;
        console.log(chalk.red(`The ${NANGO_INTEGRATIONS_NAME} directory already exists. You should run commands from within this directory`));
    }

    if (!dirExists) {
        if (debug) {
            printDebug(`Creating the nango integrations directory at ./${NANGO_INTEGRATIONS_NAME}`);
        }
        fs.mkdirSync(`./${NANGO_INTEGRATIONS_NAME}`);
    }

    const configFileLocation = inParentDirectory ? `./${NANGO_INTEGRATIONS_NAME}/${nangoConfigFile}` : `./${nangoConfigFile}`;

    if (!fs.existsSync(configFileLocation)) {
        if (debug) {
            printDebug(`Creating the ${nangoConfigFile} file at ${configFileLocation}`);
        }
        fs.writeFileSync(configFileLocation, yamlData);
    } else {
        if (debug) {
            printDebug(`Nango config file already exists at ${configFileLocation} so not creating a new one`);
        }
    }

    const envFileLocation = inParentDirectory ? `./${NANGO_INTEGRATIONS_NAME}/.env` : './.env';
    if (!fs.existsSync(envFileLocation)) {
        if (debug) {
            printDebug(`Creating the .env file at ${envFileLocation}`);
        }
        fs.writeFileSync(
            envFileLocation,
            `# Authenticates the CLI (get the keys in the dashboard's Projects Settings).
#NANGO_SECRET_KEY_DEV=xxxx-xxx-xxxx
#NANGO_SECRET_KEY_PROD=xxxx-xxx-xxxx

# Nango's instance URL (OSS: change to http://localhost:3003 or your instance URL).
NANGO_HOSTPORT=https://api.nango.dev # Default value

# How to handle CLI upgrades ("prompt", "auto" or "ignore").
NANGO_CLI_UPGRADE_MODE=prompt # Default value

# Whether to prompt before deployments.
NANGO_DEPLOY_AUTO_CONFIRM=false # Default value`
        );
    } else {
        if (debug) {
            printDebug(`.env file already exists at ${envFileLocation} so not creating a new one`);
        }
    }

    await generate(debug, inParentDirectory);

    console.log(chalk.green(`Nango integrations initialized!`));
};

const createModelFile = (notify = false) => {
    const configContents = fs.readFileSync(`./${nangoConfigFile}`, 'utf8');
    const configData: NangoConfig = yaml.load(configContents) as unknown as NangoConfig;
    const { models, integrations } = configData;
    const interfaceDefinitions = buildInterfaces(models, integrations);
    fs.writeFileSync(`./${TYPES_FILE_NAME}`, interfaceDefinitions.join('\n'));

    // insert NangoSync types to the bottom of the file
    const typesContent = fs.readFileSync(`${getNangoRootPath()}/${NangoSyncTypesFileLocation}`, 'utf8');
    fs.writeFileSync(`./${TYPES_FILE_NAME}`, typesContent, { flag: 'a' });

    if (notify) {
        console.log(chalk.green(`The ${nangoConfigFile} was updated. The interface file (${TYPES_FILE_NAME}) was updated to reflect the updated config`));
    }
};

const getConfig = async (debug = false): Promise<SimplifiedNangoIntegration[]> => {
    const config = await loadSimplifiedConfig('./');

    if (!config) {
        throw new Error(`Error loading the ${nangoConfigFile} file`);
    }

    if (debug) {
        printDebug(`Config file file found`);
    }

    return config;
};

async function parseSecretKey(environment: string, debug = false): Promise<void> {
    if (process.env['NANGO_SECRET_KEY_PROD'] && environment === 'prod') {
        if (debug) {
            printDebug(`Environment is set to prod, setting NANGO_SECRET_KEY to NANGO_SECRET_KEY_PROD.`);
        }
        process.env['NANGO_SECRET_KEY'] = process.env['NANGO_SECRET_KEY_PROD'];
    }

    if (process.env['NANGO_SECRET_KEY_DEV'] && environment === 'dev') {
        if (debug) {
            printDebug(`Environment is set to dev, setting NANGO_SECRET_KEY to NANGO_SECRET_KEY_DEV.`);
        }
        process.env['NANGO_SECRET_KEY'] = process.env['NANGO_SECRET_KEY_DEV'];
    }

    if (!process.env['NANGO_SECRET_KEY']) {
        console.log(chalk.red(`NANGO_SECRET_KEY environment variable is not set. Please set it now`));
        try {
            const secretKey = await promptly.prompt('Secret Key: ');
            if (secretKey) {
                process.env['NANGO_SECRET_KEY'] = secretKey;
            } else {
                return;
            }
        } catch (error) {
            console.log('Error occurred while trying to prompt for secret key:', error);
            process.exit(1);
        }
    }
}

export const deploy = async (options: DeployOptions, environment: string, debug = false) => {
    const { env, version, sync: optionalSyncName, autoConfirm } = options;
    await verifyNecessaryFiles(autoConfirm);

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

    await tsc(debug);

    const config = await getConfig(debug);

    const postData: IncomingSyncConfig[] = [];

    for (const integration of config) {
        const { providerConfigKey } = integration;
        let { syncs } = integration;

        if (optionalSyncName) {
            syncs = syncs.filter((sync) => sync.name === optionalSyncName);
        }

        for (const sync of syncs) {
            const { name: syncName, runs = '', returns: models, models: model_schema, type = SyncConfigType.SYNC } = sync;

            const { path: integrationFilePath, result: integrationFileResult } = checkForIntegrationFile(syncName, './');

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
                    return;
                }
            }

            if (debug) {
                printDebug(`Integration file found for ${syncName} at ${integrationFilePath}`);
            }

            const body = {
                syncName,
                providerConfigKey,
                models,
                version: version as string,
                runs,
                track_deletes: sync.track_deletes || false,
                auto_start: sync.auto_start === false ? false : true,
                attributes: sync.attributes || {},
                type,
                fileBody: fs.readFileSync(integrationFilePath, 'utf8'),
                model_schema: JSON.stringify(model_schema)
            };

            postData.push(body);
        }
    }

    const url = process.env['NANGO_HOSTPORT'] + `/sync/deploy`;

    if (process.env['NANGO_DEPLOY_AUTO_CONFIRM'] !== 'true' && !autoConfirm) {
        const confirmationUrl = process.env['NANGO_HOSTPORT'] + `/sync/deploy/confirmation`;
        try {
            const response = await axios.post(
                confirmationUrl,
                { syncs: postData, reconcile: false, debug },
                { headers: enrichHeaders(), httpsAgent: httpsAgent() }
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
                await axios
                    .post(
                        process.env['NANGO_HOSTPORT'] + `/sync/deploy`,
                        { syncs: postData, reconcile: true, debug },
                        { headers: enrichHeaders(), httpsAgent: httpsAgent() }
                    )
                    .then((response: AxiosResponse) => {
                        const results: SyncDeploymentResult[] = response.data;
                        if (results.length === 0) {
                            console.log(chalk.green(`Successfully removed the syncs/actions.`));
                        } else {
                            const nameAndVersions = results.map((result) => `${result.sync_name}@v${result.version}`);
                            console.log(chalk.green(`Successfully deployed the syncs/actions: ${nameAndVersions.join(', ')}!`));
                        }
                    })
                    .catch((err) => {
                        const errorMessage = JSON.stringify(err.response.data, null, 2);
                        console.log(chalk.red(`Error deploying the syncs/actions with the following error: ${errorMessage}`));
                        process.exit(1);
                    });
            } else {
                console.log(chalk.red('Syncs/Actions were not deployed. Exiting'));
                process.exit(0);
            }
        } catch (err: any) {
            let errorMessage;
            if (!err?.response?.data) {
                const {
                    message,
                    stack,
                    config: { method },
                    code,
                    status
                } = err?.toJSON() as any;

                const errorObject = { message, stack, code, status, url, method };
                errorMessage = JSON.stringify(errorObject, null, 2);
            } else {
                errorMessage = JSON.stringify(err.response.data, null, 2);
            }
            console.log(chalk.red(`Error deploying the syncs/actions with the following error: ${errorMessage}`));
            process.exit(1);
        }
    } else {
        if (debug) {
            printDebug(`Auto confirm is set so deploy will start without confirmation`);
        }
        await deploySyncs(url, { syncs: postData, reconcile: true, debug });
    }
};

async function deploySyncs(url: string, body: { syncs: IncomingSyncConfig[]; reconcile: boolean; debug: boolean }) {
    await axios
        .post(url, body, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
        .then((response: AxiosResponse) => {
            const results: SyncDeploymentResult[] = response.data;
            if (results.length === 0) {
                console.log(chalk.green(`Successfully removed the syncs/actions.`));
            } else {
                const nameAndVersions = results.map((result) => `${result.sync_name}@v${result.version}`);
                console.log(chalk.green(`Successfully deployed the syncs/actions: ${nameAndVersions.join(', ')}!`));
            }
        })
        .catch((err: any) => {
            let errorMessage;
            if (!err?.response?.data) {
                const {
                    message,
                    stack,
                    config: { method },
                    code,
                    status
                } = err?.toJSON() as any;

                const errorObject = { message, stack, code, status, url, method };
                errorMessage = JSON.stringify(errorObject, null, 2);
            } else {
                errorMessage = JSON.stringify(err.response.data, null, 2);
            }
            console.log(chalk.red(`Error deploying the syncs/actions with the following error: ${errorMessage}`));
            process.exit(1);
        });
}

export const dryRun = async (options: RunArgs, environment: string, debug = false) => {
    let syncName = '';
    let connectionId, suppliedLastSyncDate, actionInput;

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
        ({ sync: syncName, connectionId, lastSyncDate: suppliedLastSyncDate, input: actionInput } = options);
    }

    if (!syncName) {
        console.log(chalk.red('Sync name is required'));
        return;
    }

    if (!connectionId) {
        console.log(chalk.red('Connection id is required'));
        return;
    }

    const config = await getConfig(debug);

    const providerConfigKey = config.find((config) => config.syncs.find((sync) => sync.name === syncName))?.providerConfigKey;

    if (!providerConfigKey) {
        console.log(chalk.red(`Provider config key not found, please check that the provider exists for this sync name: ${syncName}`));
        return;
    }

    const syncInfo = config.find((config) => config.syncs.find((sync) => sync.name === syncName))?.syncs.find((sync) => sync.name === syncName);

    if (debug) {
        printDebug(`Provider config key found to be ${providerConfigKey}`);
    }

    const nangoConnection = (await getConnection(
        providerConfigKey as string,
        connectionId as string,
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

    if (process.env['NANGO_HOSTPORT'] === cloudHost || process.env['NANGO_HOSTPORT'] === stagingHost) {
        process.env['NANGO_CLOUD'] = 'true';
    }

    let lastSyncDate = null;

    if (suppliedLastSyncDate) {
        if (debug) {
            printDebug(`Last sync date supplied as ${suppliedLastSyncDate}`);
        }
        lastSyncDate = new Date(suppliedLastSyncDate as string);
    }

    const result = await tsc(debug, syncName);

    if (!result) {
        console.log(chalk.red('The sync/action did not compile successfully. Exiting'));
        return;
    }

    let normalizedInput;
    try {
        normalizedInput = JSON.parse(actionInput as unknown as string);
    } catch (e) {
        normalizedInput = actionInput;
    }

    const syncRun = new syncRunService({
        writeToDb: false,
        nangoConnection,
        input: normalizedInput as object,
        isAction: syncInfo?.type === SyncConfigType.ACTION,
        syncId: 'abc',
        activityLogId: -1,
        syncJobId: -1,
        syncName,
        syncType: SyncType.INITIAL,
        loadLocation: './',
        debug
    });

    try {
        const secretKey = process.env['NANGO_SECRET_KEY'];
        const results = await syncRun.run(lastSyncDate, true, secretKey, process.env['NANGO_HOSTPORT']);

        analytics.trackByEnvironmentId('sync:cli_dry_run_performed', nangoConnection.environment_id, {
            connection_id: nangoConnection.id,
            sync_name: syncName,
            provider_config_key: providerConfigKey,
            last_sync_date: lastSyncDate?.toISOString()
        });

        if (results) {
            console.log(JSON.stringify(results, null, 2));
        }
        process.exit(0);
    } catch (e) {
        process.exit(1);
    }
};

export const tsc = async (debug = false, syncName?: string): Promise<boolean> => {
    const tsconfig = fs.readFileSync(`${getNangoRootPath()}/tsconfig.dev.json`, 'utf8');

    const distDir = './dist';
    if (!fs.existsSync(distDir)) {
        if (debug) {
            printDebug(`Creating ${distDir} directory`);
        }
        fs.mkdirSync(distDir);
    }

    if (!fs.existsSync(`./${TYPES_FILE_NAME}`)) {
        if (debug) {
            printDebug(`Creating ${TYPES_FILE_NAME} file`);
        }
        createModelFile();
    }

    const compiler = tsNode.create({
        compilerOptions: JSON.parse(tsconfig).compilerOptions
    });

    if (debug) {
        printDebug(`Compiler options: ${JSON.stringify(JSON.parse(tsconfig).compilerOptions, null, 2)}`);
    }

    const integrationFiles = syncName ? [`./${syncName}.ts`] : glob.sync(`./*.ts`);
    let success = true;

    const config = await getConfig();

    for (const filePath of integrationFiles) {
        try {
            const providerConfiguration = config.find((config) => config.syncs.find((sync) => sync.name === path.basename(filePath, '.ts')));
            const syncConfig = providerConfiguration?.syncs.find((sync) => sync.name === path.basename(filePath, '.ts'));
            const type = syncConfig?.type || SyncConfigType.SYNC;

            if (!nangoCallsAreUsedCorrectly(filePath, type)) {
                return false;
            }
            const result = compiler.compile(fs.readFileSync(filePath, 'utf8'), filePath);
            const jsFilePath = filePath.replace(/\/[^\/]*$/, `/dist/${path.basename(filePath.replace('.ts', '.js'))}`);

            fs.writeFileSync(jsFilePath, result);
            console.log(chalk.green(`Compiled "${filePath}" successfully`));
        } catch (error) {
            console.error(`Error compiling "${filePath}":`);
            console.error(error);
            success = false;
        }
    }

    return success;
};

const nangoCallsAreUsedCorrectly = (filePath: string, type = SyncConfigType.SYNC): boolean => {
    const code = fs.readFileSync(filePath, 'utf-8');
    let areAwaited = true;
    let usedCorrectly = true;

    const ast = parser.parse(code, { sourceType: 'module', plugins: ['typescript'] });

    const awaitMessage = (call: string, lineNumber: number) =>
        console.log(chalk.red(`nango.${call}() calls must be awaited in "${filePath}:${lineNumber}". Not awaiting can lead to unexpected results.`));

    const disallowedMessage = (call: string, lineNumber: number) =>
        console.log(chalk.red(`nango.${call}() calls are not allowed in an action script. Please remove it at "${filePath}:${lineNumber}".`));

    const nangoCalls = [
        'batchSend',
        'batchSave',
        'batchDelete',
        'log',
        'getFieldMapping',
        'setFieldMapping',
        'getMetadata',
        'setMetadata',
        'get',
        'post',
        'put',
        'patch',
        'delete',
        'getConnection',
        'setLastSyncDate',
        'getEnvironmentVariables'
    ];

    const disallowedActionCalls = ['batchSend', 'batchSave', 'batchDelete', 'setLastSyncDate'];

    const deprecatedCalls: Record<string, string> = {
        batchSend: 'batchSave',
        getFieldMapping: 'getMetadata',
        setFieldMapping: 'setMetadata'
    };

    // @ts-ignore
    traverse.default(ast, {
        CallExpression(path: NodePath<t.CallExpression>) {
            const lineNumber = path.node.loc?.start.line as number;
            const callee = path.node.callee as t.MemberExpression;
            if (callee.object?.type === 'Identifier' && callee.object.name === 'nango' && callee.property?.type === 'Identifier') {
                if (deprecatedCalls[callee.property.name as string]) {
                    console.warn(
                        chalk.yellow(
                            `nango.${callee.property.name}() used at line ${lineNumber} is deprecated. Use nango.${
                                deprecatedCalls[callee.property.name]
                            }() instead.`
                        )
                    );
                }
                if (type === SyncConfigType.ACTION) {
                    if (disallowedActionCalls.includes(callee.property.name)) {
                        disallowedMessage(callee.property.name, lineNumber);
                        usedCorrectly = false;
                    }
                }

                if (path.parent.type !== 'AwaitExpression') {
                    if (nangoCalls.includes(callee.property.name)) {
                        awaitMessage(callee.property.name, lineNumber);
                        areAwaited = false;
                    }
                }
            }
        }
    });

    return areAwaited && usedCorrectly;
};

export const tscWatch = async (debug = false) => {
    const tsconfig = fs.readFileSync(`${getNangoRootPath()}/tsconfig.dev.json`, 'utf8');
    const config = await getConfig();

    const watchPath = [`./*.ts`, `./${nangoConfigFile}`];

    if (debug) {
        printDebug(`Watching ${watchPath.join(', ')}`);
    }

    const watcher = chokidar.watch(watchPath, {
        ignoreInitial: false,
        ignored: (filePath: string) => {
            return filePath === TYPES_FILE_NAME;
        }
    });

    const distDir = './dist';

    if (!fs.existsSync(distDir)) {
        if (debug) {
            printDebug(`Creating ${distDir} directory`);
        }
        fs.mkdirSync(distDir);
    }

    if (!fs.existsSync(`./${TYPES_FILE_NAME}`)) {
        if (debug) {
            printDebug(`Creating ${TYPES_FILE_NAME} file`);
        }
        createModelFile();
    }

    watcher.on('add', (filePath: string) => {
        if (filePath === nangoConfigFile) {
            return;
        }
        compileFile(filePath);
    });

    watcher.on('unlink', (filePath: string) => {
        if (filePath === nangoConfigFile) {
            return;
        }
        const jsFilePath = `./dist/${path.basename(filePath.replace('.ts', '.js'))}`;

        fs.unlinkSync(jsFilePath);
    });

    watcher.on('change', (filePath: string) => {
        if (filePath === nangoConfigFile) {
            // config file changed, re-compile each ts file
            const integrationFiles = glob.sync(`./*.ts`);
            for (const file of integrationFiles) {
                // strip the file to just the last part
                const strippedFile = file.replace(/^.*[\\\/]/, '');
                compileFile(strippedFile);
            }
            return;
        }
        compileFile(filePath);
    });

    function compileFile(filePath: string) {
        const compiler = tsNode.create({
            compilerOptions: JSON.parse(tsconfig).compilerOptions
        });

        try {
            const providerConfiguration = config.find((config) => config.syncs.find((sync) => sync.name === path.basename(filePath, '.ts')));
            const syncConfig = providerConfiguration?.syncs.find((sync) => sync.name === path.basename(filePath, '.ts'));
            const type = syncConfig?.type || SyncConfigType.SYNC;

            if (!nangoCallsAreUsedCorrectly(filePath, type)) {
                return;
            }
            const result = compiler.compile(fs.readFileSync(filePath, 'utf8'), filePath);
            const jsFilePath = `./dist/${path.basename(filePath.replace('.ts', '.js'))}`;

            fs.writeFileSync(jsFilePath, result);
            console.log(chalk.green(`Compiled ${filePath} successfully`));
        } catch (error) {
            console.error(`Error compiling ${filePath}:`);
            console.error(error);
            return;
        }
    }
};

export const configWatch = (debug = false) => {
    const watchPath = `./${nangoConfigFile}`;
    if (debug) {
        printDebug(`Watching ${watchPath}`);
    }
    const watcher = chokidar.watch(watchPath, { ignoreInitial: true });

    watcher.on('change', () => {
        createModelFile(true);
    });
};

let child: ChildProcess | undefined;
process.on('SIGINT', () => {
    if (child) {
        const dockerDown = spawn('docker', ['compose', '-f', `${getNangoRootPath()}/docker/docker-compose.yaml`, '--project-directory', '.', 'down'], {
            stdio: 'inherit'
        });
        dockerDown.on('exit', () => {
            process.exit();
        });
    } else {
        process.exit();
    }
});

/**
 * Docker Run
 * @desc spawn a child process to run the docker compose located in the cli
 * Look into https://www.npmjs.com/package/docker-compose to avoid dependency maybe?
 */
export const dockerRun = async (debug = false) => {
    const cwd = process.cwd();

    const args = ['compose', '-f', `${getNangoRootPath()}/docker/docker-compose.yaml`, '--project-directory', '.', 'up', '--build'];

    if (debug) {
        printDebug(`Running docker with args: ${args.join(' ')}`);
    }

    child = spawn('docker', args, {
        cwd,
        detached: false,
        stdio: 'inherit'
    });

    await new Promise((resolve, reject) => {
        child?.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Error with the nango docker containers, please check your containers using 'docker ps''`));
                return;
            }
            resolve(true);
        });

        child?.on('error', reject);
    });
};
