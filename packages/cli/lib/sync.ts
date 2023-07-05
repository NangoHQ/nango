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
    SyncModelSchema,
    IncomingSyncConfig,
    NangoConfig,
    Connection as NangoConnection,
    NangoIntegration,
    NangoIntegrationData
} from '@nangohq/shared';
import { loadSimplifiedConfig, cloudHost, stagingHost, SyncType, syncRunService, nangoConfigFile, checkForIntegrationFile } from '@nangohq/shared';
import {
    hostport,
    port,
    httpsAgent,
    verifyNecessaryFiles,
    getConnection,
    NANGO_INTEGRATIONS_LOCATION,
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
    provider: string;
    connection: string;
    lastSyncDate?: string;
    useServerLastSyncDate?: boolean;
}

const exampleSyncName = 'github-issue-example';

const createModelFile = (notify = false) => {
    const cwd = process.cwd();
    const configContents = fs.readFileSync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/${nangoConfigFile}`), 'utf8');
    const configData: NangoConfig = yaml.load(configContents) as unknown as NangoConfig;
    const { models } = configData;
    const interfaceDefinitions = buildInterfaces(models);
    fs.writeFileSync(`${NANGO_INTEGRATIONS_LOCATION}/${TYPES_FILE_NAME}`, interfaceDefinitions.join('\n'));

    // insert NangoSync types to the bottom of the file
    const typesContent = fs.readFileSync(`${getNangoRootPath()}/${NangoSyncTypesFileLocation}`, 'utf8');
    fs.writeFileSync(`${NANGO_INTEGRATIONS_LOCATION}/${TYPES_FILE_NAME}`, typesContent, { flag: 'a' });

    if (notify) {
        const rawNangoIntegrationLocation = NANGO_INTEGRATIONS_LOCATION.replace('./', '');
        console.log(
            chalk.green(
                `${rawNangoIntegrationLocation}/${nangoConfigFile} was updated. The interface file (${rawNangoIntegrationLocation}/${TYPES_FILE_NAME}) was updated to reflect the updated config`
            )
        );
    }
};

const getConfig = async (debug = false) => {
    const cwd = process.cwd();
    const config = await loadSimplifiedConfig(path.resolve(cwd, NANGO_INTEGRATIONS_LOCATION));

    if (!config) {
        throw new Error(`Error loading the ${nangoConfigFile} file`);
    }

    if (debug) {
        printDebug(`Config file file found`);
    }

    return config;
};

export const deploy = async (options: DeployOptions, debug = false) => {
    const { env, version, sync: optionalSyncName, secretKey, host, autoConfirm } = options;
    await verifyNecessaryFiles(autoConfirm);

    if (host) {
        if (debug) {
            printDebug(`Global host flag is set, setting NANGO_HOSTPORT to ${host}.`);
        }
        process.env['NANGO_HOSTPORT'] = host;
    }

    if (secretKey) {
        if (debug) {
            printDebug(`Global secretKey flag is set, setting NANGO_SECRET_KEY.`);
        }
        process.env['NANGO_SECRET_KEY'] = secretKey;
    }

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
    }

    if (process.env['NANGO_HOSTPORT'] !== `http://localhost:${port}` && !process.env['NANGO_SECRET_KEY']) {
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

    tsc(debug);

    const config = await getConfig(debug);
    const cwd = process.cwd();

    const postData: IncomingSyncConfig[] = [];

    for (const integration of config) {
        const { providerConfigKey } = integration;
        let { syncs } = integration;

        if (optionalSyncName) {
            syncs = syncs.filter((sync) => sync.name === optionalSyncName);
        }

        for (const sync of syncs) {
            const { name: syncName, runs, returns: models, models: model_schema } = sync;

            const { path: integrationFilePath, result: integrationFileResult } = checkForIntegrationFile(
                syncName,
                path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}`)
            );

            if (!integrationFileResult) {
                console.log(chalk.red(`No integration file found for ${syncName} at ${integrationFilePath}. Skipping...`));
                continue;
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
                fileBody: fs.readFileSync(integrationFilePath, 'utf8'),
                model_schema: JSON.stringify(model_schema) as unknown as SyncModelSchema[]
            };

            postData.push(body);
        }
    }

    const url = process.env['NANGO_HOSTPORT'] + `/sync/deploy`;

    if (postData.length === 0) {
        console.log(chalk.red(`No syncs found to deploy. Please make sure your integration files compiled successfully and exist in your dist directory`));
        return;
    }

    if (!process.env['NANGO_DEPLOY_AUTO_CONFIRM'] && !autoConfirm) {
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
                    sync.connections === 0
                        ? 'create the configuration for this sync.'
                        : `start syncing the corresponding data for ${sync.connections} existing connections.`;
                console.log(chalk.yellow(`Sync "${sync.name}" has been added. Nango will ${actionMessage}`));
            }

            for (const sync of deletedSyncs) {
                console.log(
                    chalk.red(
                        `Sync "${sync.name}" has been removed. It will stop running and the corresponding data will be deleted for ${sync.connections} existing connections.`
                    )
                );
            }

            const confirmation = await promptly.confirm('Do you want to continue with these changes y/n?');
            if (confirmation) {
                await axios
                    .post(
                        process.env['NANGO_HOSTPORT'] + `/sync/deploy`,
                        { syncs: postData, reconcile: true, debug },
                        { headers: enrichHeaders(), httpsAgent: httpsAgent() }
                    )
                    .then((response: AxiosResponse) => {
                        const results: SyncDeploymentResult[] = response.data;
                        const nameAndVersions = results.map((result) => `${result.sync_name}@v${result.version}`);
                        console.log(chalk.green(`Successfully deployed the syncs: ${nameAndVersions.join(', ')}!`));
                    })
                    .catch((err) => {
                        const errorMessage = JSON.stringify(err.response.data, null, 2);
                        console.log(chalk.red(`Error deploying the syncs with the following error: ${errorMessage}`));
                        process.exit(1);
                    });
            } else {
                console.log(chalk.red('Syncs were not deployed. Exiting'));
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
            console.log(chalk.red(`Error deploying the syncs with the following error: ${errorMessage}`));
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
            const nameAndVersions = results.map((result) => `${result.sync_name}@v${result.version}`);
            console.log(chalk.green(`Successfully deployed the syncs: ${nameAndVersions.join(', ')}!`));
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
            console.log(chalk.red(`Error deploying the syncs with the following error: ${errorMessage}`));
            process.exit(1);
        });
}

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

/**
 * Init
 * If we're not currently in the nango-integrations directory create one
 * and create an example nango.yaml file
 */
export const init = (debug = false) => {
    const data: NangoConfig = {
        integrations: {
            'demo-github-integration': {
                [exampleSyncName]: {
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
            `#NANGO_HOSTPORT=https://api-staging.nango.dev
#NANGO_AUTO_UPGRADE=true # set to true to automatically upgrade to the latest version of nango
#NANGO_NO_PROMPT_FOR_UPGRADE=true # set to true to not prompt for upgrade
#NANGO_DEPLOY_AUTO_CONFIRM=true # set to true to automatically confirm deployment without prompting
#NANGO_SECRET_KEY=xxxx-xxx-xxxx # required if deploying to cloud
#NANGO_PORT=use-this-to-override-the-default-3003
#NANGO_DB_PORT=use-this-to-override-the-default-5432`
        );
    } else {
        if (debug) {
            printDebug(`.env file already exists at ${envFileLocation} so not creating a new one`);
        }
    }

    console.log(chalk.green(`Nango integrations initialized!`));
};

export const generate = async (debug = false) => {
    const templateContents = fs.readFileSync(path.resolve(__dirname, './integration.ejs'), 'utf8');
    const githubExampleTemplateContents = fs.readFileSync(path.resolve(__dirname, './integration.github.ejs'), 'utf8');

    const cwd = process.cwd();
    const configContents = fs.readFileSync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/${nangoConfigFile}`), 'utf8');
    const configData: NangoConfig = yaml.load(configContents) as unknown as NangoConfig;
    const { integrations } = configData;
    const { models } = configData;

    const interfaceDefinitions = buildInterfaces(models);

    fs.writeFileSync(`${NANGO_INTEGRATIONS_LOCATION}/${TYPES_FILE_NAME}`, interfaceDefinitions.join('\n'));

    if (debug) {
        printDebug(`Interfaces from the ${nangoConfigFile} file written to ${TYPES_FILE_NAME}`);
    }

    // insert NangoSync types to the bottom of the file
    const typesContent = fs.readFileSync(`${getNangoRootPath()}/${NangoSyncTypesFileLocation}`, 'utf8');
    fs.writeFileSync(`${NANGO_INTEGRATIONS_LOCATION}/${TYPES_FILE_NAME}`, typesContent, { flag: 'a' });

    if (debug) {
        printDebug(`NangoSync types written to ${TYPES_FILE_NAME}`);
    }

    for (let i = 0; i < Object.keys(integrations).length; i++) {
        const providerConfigKey = Object.keys(integrations)[i] as string;
        if (debug) {
            printDebug(`Generating ${providerConfigKey} integrations`);
        }
        const syncObject = integrations[providerConfigKey] as unknown as { [key: string]: NangoIntegration };
        const syncNames = Object.keys(syncObject);
        for (let k = 0; k < syncNames.length; k++) {
            const syncName = syncNames[k] as string;
            if (debug) {
                printDebug(`Generating ${syncName} integration`);
            }
            const syncData = syncObject[syncName] as unknown as NangoIntegrationData;
            const { returns: models } = syncData;
            const syncNameCamel = syncName
                .split('-')
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join('');
            const ejsTeamplateContents = syncName === exampleSyncName ? githubExampleTemplateContents : templateContents;
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

            if (!fs.existsSync(`${NANGO_INTEGRATIONS_LOCATION}/${syncName}.ts`)) {
                fs.writeFileSync(`${NANGO_INTEGRATIONS_LOCATION}/${syncName}.ts`, rendered);
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

export const run = async (args: string[], options: RunArgs, debug = false) => {
    let syncName, providerConfigKey, connectionId, suppliedLastSyncDate, host, secretKey;
    if (args.length > 0) {
        [syncName, providerConfigKey, connectionId, suppliedLastSyncDate] = args;
    }

    if (Object.keys(options).length > 0) {
        ({ sync: syncName, provider: providerConfigKey, connection: connectionId, lastSyncDate: suppliedLastSyncDate, host, secretKey } = options);
    }

    if (!syncName) {
        console.log(chalk.red('Sync name is required'));
        return;
    }

    if (!providerConfigKey) {
        console.log(chalk.red('Provider config key is required'));
        return;
    }

    if (!connectionId) {
        console.log(chalk.red('Connection id is required'));
        return;
    }

    if (debug) {
        if (host) {
            printDebug(`Host value is set to ${host}. This will override the value in the .env file`);
        }
    }

    if (host) {
        process.env['NANGO_HOSTPORT'] = host;
    }

    if (secretKey) {
        process.env['NANGO_SECRET_KEY'] = secretKey;
    }

    if (!process.env['NANGO_HOSTPORT']) {
        if (debug) {
            printDebug(`NANGO_HOSTPORT is not set. Setting the default to ${hostport}`);
        }
        process.env['NANGO_HOSTPORT'] = hostport;
    }

    if (debug) {
        printDebug(`NANGO_HOSTPORT is set to ${process.env['NANGO_HOSTPORT']}`);
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

    const cwd = process.cwd();

    const syncRun = new syncRunService({
        writeToDb: false,
        nangoConnection,
        syncName,
        syncType: SyncType.INITIAL,
        loadLocation: path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}`),
        debug
    });

    try {
        const secretKey = process.env['NANGO_SECRET_KEY'];
        const results = await syncRun.run(lastSyncDate, true, secretKey, process.env['NANGO_HOSTPORT']);
        console.log(JSON.stringify(results, null, 2));
        process.exit(0);
    } catch (e) {
        process.exit(1);
    }
};

export const tsc = (debug = false) => {
    const cwd = process.cwd();
    const tsconfig = fs.readFileSync(`${getNangoRootPath()}/tsconfig.dev.json`, 'utf8');

    const distDir = path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist`);

    if (!fs.existsSync(distDir)) {
        if (debug) {
            printDebug(`Creating ${distDir} directory`);
        }
        fs.mkdirSync(distDir);
    }

    if (!fs.existsSync(`${NANGO_INTEGRATIONS_LOCATION}/${TYPES_FILE_NAME}`)) {
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

    const integrationFiles = glob.sync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/*.ts`));
    for (const filePath of integrationFiles) {
        try {
            if (!nangoCallsAreAwaited(filePath)) {
                return;
            }
            const result = compiler.compile(fs.readFileSync(filePath, 'utf8'), filePath);
            const jsFilePath = filePath.replace(/\/[^\/]*$/, `/dist/${path.basename(filePath.replace('.ts', '.js'))}`);

            fs.writeFileSync(jsFilePath, result);
            console.log(chalk.green(`Compiled "${filePath}" successfully`));
        } catch (error) {
            console.error(`Error compiling "${filePath}":`);
            console.error(error);
        }
    }
};

const nangoCallsAreAwaited = (filePath: string): boolean => {
    const code = fs.readFileSync(filePath, 'utf-8');
    let areAwaited = true;

    const ast = parser.parse(code, { sourceType: 'module', plugins: ['typescript'] });

    const message = (call: string, lineNumber: number) =>
        console.log(chalk.red(`nango.${call}() calls must be awaited in "${filePath}:${lineNumber}". Not awaiting can lead to unexpected results.`));

    const nangoCalls = ['batchSend', 'log', 'getFieldMapping', 'setFieldMapping', 'get', 'post', 'put', 'patch', 'delete', 'getConnection'];

    // @ts-ignore
    traverse.default(ast, {
        CallExpression(path: NodePath<t.CallExpression>) {
            const lineNumber = path.node.loc?.start.line as number;
            const callee = path.node.callee as t.MemberExpression;
            if (callee.object?.type === 'Identifier' && callee.object.name === 'nango' && callee.property?.type === 'Identifier') {
                if (path.parent.type !== 'AwaitExpression') {
                    if (nangoCalls.includes(callee.property.name)) {
                        message(callee.property.name, lineNumber);
                        areAwaited = false;
                    }
                }
            }
        }
    });

    return areAwaited;
};

export const tscWatch = (debug = false) => {
    const cwd = process.cwd();
    const tsconfig = fs.readFileSync(`${getNangoRootPath()}/tsconfig.dev.json`, 'utf8');

    const watchPath = [`${NANGO_INTEGRATIONS_LOCATION}/*.ts`, `${NANGO_INTEGRATIONS_LOCATION}/${nangoConfigFile}`];

    if (debug) {
        printDebug(`Watching ${watchPath.join(', ')}`);
    }

    const rawNangoIntegrationLocation = NANGO_INTEGRATIONS_LOCATION.replace('./', '');

    const watcher = chokidar.watch(watchPath, {
        ignoreInitial: false,
        ignored: (filePath: string) => {
            return filePath === `${rawNangoIntegrationLocation}/${TYPES_FILE_NAME}`;
        }
    });

    const distDir = path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist`);

    if (!fs.existsSync(distDir)) {
        if (debug) {
            printDebug(`Creating ${distDir} directory`);
        }
        fs.mkdirSync(distDir);
    }

    if (!fs.existsSync(`${NANGO_INTEGRATIONS_LOCATION}/${TYPES_FILE_NAME}`)) {
        if (debug) {
            printDebug(`Creating ${TYPES_FILE_NAME} file`);
        }
        createModelFile();
    }

    watcher.on('add', (filePath: string) => {
        if (filePath === `${rawNangoIntegrationLocation}/${nangoConfigFile}`) {
            return;
        }
        compileFile(filePath);
    });

    watcher.on('unlink', (filePath: string) => {
        if (filePath === `${rawNangoIntegrationLocation}/${nangoConfigFile}`) {
            return;
        }
        const jsFilePath = path.join(path.dirname(filePath), path.basename(filePath, '.ts') + '.js');
        const distJSFilePath = jsFilePath.replace(rawNangoIntegrationLocation, `${rawNangoIntegrationLocation}/dist`);
        fs.unlinkSync(distJSFilePath);
    });

    watcher.on('change', (filePath: string) => {
        if (filePath === `${rawNangoIntegrationLocation}/${nangoConfigFile}`) {
            // config file changed, re-compile each ts file
            const integrationFiles = glob.sync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/*.ts`));
            for (const file of integrationFiles) {
                compileFile(file);
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
            if (!nangoCallsAreAwaited(filePath)) {
                return;
            }
            const result = compiler.compile(fs.readFileSync(filePath, 'utf8'), filePath);
            const jsFilePath = path.join(path.dirname(filePath), path.basename(filePath, '.ts') + '.js');

            const distJSFilePath = jsFilePath.replace(rawNangoIntegrationLocation, `${rawNangoIntegrationLocation}/dist`);
            fs.writeFileSync(distJSFilePath, result);
            console.log(chalk.green(`Compiled ${filePath} successfully`));
        } catch (error) {
            console.error(`Error compiling ${filePath}:`);
            console.error(error);
            return;
        }
    }
};

export const configWatch = (debug = false) => {
    const watchPath = `${NANGO_INTEGRATIONS_LOCATION}/${nangoConfigFile}`;
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
