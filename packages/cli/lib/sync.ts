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
    port,
    hostport,
    httpsAgent,
    verifyNecessaryFiles,
    getConnection,
    NANGO_INTEGRATIONS_LOCATION,
    buildInterfaces,
    enrichHeaders,
    checkEnvVars,
    getNangoRootPath
} from './utils.js';
import type { DeployOptions } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const TYPES_FILE_NAME = 'models.ts';
const NangoSyncTypesFileLocation = 'dist/nango-sync.d.ts';

interface RunArgs {
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

const getConfig = async () => {
    const cwd = process.cwd();
    const config = await loadSimplifiedConfig(path.resolve(cwd, NANGO_INTEGRATIONS_LOCATION));

    if (!config) {
        throw new Error(`Error loading the ${nangoConfigFile} file`);
    }

    return config;
};

export const deploy = async (options: DeployOptions) => {
    const { env, version, sync: optionalSyncName, secretKey, host, autoConfirm } = options;
    await verifyNecessaryFiles(autoConfirm);

    if (host) {
        process.env['NANGO_HOSTPORT'] = host;
    }

    if (secretKey) {
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

    checkEnvVars(process.env['NANGO_HOSTPORT']);
    tsc();

    const config = await getConfig();
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
            const response = await axios.post(confirmationUrl, { syncs: postData, reconcile: false }, { headers: enrichHeaders(), httpsAgent: httpsAgent() });
            console.log(JSON.stringify(response.data, null, 2));
            const { newSyncs, deletedSyncs } = response.data;

            for (const sync of newSyncs) {
                const actionMessage =
                    sync.connections === 0
                        ? 'create the configuration for this sync.'
                        : `start syncing the corresponding data for ${sync.connections} existing connections.`;
                console.log(chalk.yellow(`Sync "${sync.name}" as been added. Nango will ${actionMessage}`));
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
                        { syncs: postData, reconcile: true },
                        { headers: enrichHeaders(), httpsAgent: httpsAgent() }
                    )
                    .then((_) => {
                        console.log(chalk.green(`Successfully deployed the syncs!`));
                    })
                    .catch((err) => {
                        const errorMessage = JSON.stringify(err.response.data, null, 2);
                        console.log(chalk.red(`Error deploying the syncs with the following error: ${errorMessage}`));
                        process.exit(1);
                    });
            } else {
                //await deploySyncs(url, { syncs: postData, reconcile: false });
                console.log(chalk.yellow('Syncs were not deployed. Exiting'));
                process.exit(0);
            }
        } catch (err: any) {
            console.log(err);
            const errorMessage = JSON.stringify(err.response.data, null, 2);
            console.log(chalk.red(`Error deploying the syncs with the following error: ${errorMessage}`));
            process.exit(1);
        }
    } else {
        await deploySyncs(url, { syncs: postData, reconcile: true });
    }
};

async function deploySyncs(url: string, body: { syncs: IncomingSyncConfig[]; reconcile: boolean }) {
    await axios
        .post(url, body, { headers: enrichHeaders(), httpsAgent: httpsAgent() })
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
}

export const version = () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(getNangoRootPath() as string, 'package.json'), 'utf8'));
    const dockerComposeYaml = fs.readFileSync(path.resolve(__dirname, '../docker/docker-compose.yaml'), 'utf8');
    const dockerCompose = yaml.load(dockerComposeYaml) as any;

    const nangoServerImage = dockerCompose.services['nango-server'].image;
    const nangoWorkerImage = dockerCompose.services['nango-worker'].image;

    const nangoServerVersion = nangoServerImage.split(':').pop();
    const nangoWorkerVersion = nangoWorkerImage.split(':').pop();

    console.log(chalk.green('Nango Server version:'), nangoServerVersion);
    console.log(chalk.green('Nango Worker version:'), nangoWorkerVersion);
    console.log(chalk.green('Nango CLI version:'), packageJson.version);
};

export const init = () => {
    const data: NangoConfig = {
        integrations: {
            github: {
                [exampleSyncName]: {
                    runs: 'every half hour',
                    returns: ['GithubIssue']
                }
            },
            'asana-dev': {
                'asana-projects': {
                    runs: 'every hour',
                    returns: ['AsanaProject']
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
            },
            AsanaProject: {
                id: 'number',
                type: 'string'
            }
        }
    };
    const yamlData = yaml.dump(data);

    if (!fs.existsSync(NANGO_INTEGRATIONS_LOCATION)) {
        fs.mkdirSync(NANGO_INTEGRATIONS_LOCATION);
    }

    if (!fs.existsSync(`${NANGO_INTEGRATIONS_LOCATION}/${nangoConfigFile}`)) {
        fs.writeFileSync(`${NANGO_INTEGRATIONS_LOCATION}/${nangoConfigFile}`, yamlData);
    }

    // check if a .env file exists and if not create it with some default content
    if (!fs.existsSync('.env')) {
        fs.writeFileSync(
            '.env',
            `#NANGO_HOSTPORT=https://api-staging.nango.dev
#NANGO_AUTO_UPGRADE=true
#NANGO_NO_PROMPT_FOR_UPGRADE=false
#NANGO_DEPLOY_AUTO_CONFIRM=false
#NANGO_SECRET_KEY=xxxx-xxx-xxxx
#NANGO_INTEGRATIONS_LOCATION=use-this-to-override-where-the-nango-integrations-directory-goes
#NANGO_PORT=use-this-to-override-the-default-3003
#NANGO_DB_PORT=use-this-to-override-the-default-5432`
        );
    }

    console.log(chalk.green(`Nango integrations initialized!`));
};

export const generate = async () => {
    const templateContents = fs.readFileSync(path.resolve(__dirname, './integration.ejs'), 'utf8');
    const githubExampleTemplateContents = fs.readFileSync(path.resolve(__dirname, './integration.github.ejs'), 'utf8');

    const cwd = process.cwd();
    const configContents = fs.readFileSync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/${nangoConfigFile}`), 'utf8');
    const configData: NangoConfig = yaml.load(configContents) as unknown as NangoConfig;
    const { integrations } = configData;
    const { models } = configData;

    const interfaceDefinitions = buildInterfaces(models);

    fs.writeFileSync(`${NANGO_INTEGRATIONS_LOCATION}/${TYPES_FILE_NAME}`, interfaceDefinitions.join('\n'));

    // insert NangoSync types to the bottom of the file
    const typesContent = fs.readFileSync(`${getNangoRootPath()}/${NangoSyncTypesFileLocation}`, 'utf8');
    fs.writeFileSync(`${NANGO_INTEGRATIONS_LOCATION}/${TYPES_FILE_NAME}`, typesContent, { flag: 'a' });

    for (let i = 0; i < Object.keys(integrations).length; i++) {
        const providerConfigKey = Object.keys(integrations)[i] as string;
        const syncObject = integrations[providerConfigKey] as unknown as { [key: string]: NangoIntegration };
        const syncNames = Object.keys(syncObject);
        for (let k = 0; k < syncNames.length; k++) {
            const syncName = syncNames[k] as string;
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
            }
        }
    }

    console.log(chalk.green(`Integration files have been created`));
};

export const run = async (args: string[], options: RunArgs) => {
    let syncName, providerConfigKey, connectionId, suppliedLastSyncDate;
    if (args.length > 0) {
        [syncName, providerConfigKey, connectionId, suppliedLastSyncDate] = args;
    }

    if (Object.keys(options).length > 0) {
        ({ sync: syncName, provider: providerConfigKey, connection: connectionId, lastSyncDate: suppliedLastSyncDate } = options);
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

    const nangoConnection = (await getConnection(providerConfigKey as string, connectionId as string, {
        'Nango-Is-Sync': true,
        'Nango-Is-Dry-Run': true
    })) as unknown as NangoConnection;

    if (!nangoConnection) {
        console.log(chalk.red('Connection not found'));
        return;
    }

    if (hostport === cloudHost || hostport === stagingHost) {
        process.env['NANGO_CLOUD'] = 'true';
    }

    let lastSyncDate = null;

    if (suppliedLastSyncDate) {
        lastSyncDate = new Date(suppliedLastSyncDate as string);
    }

    const cwd = process.cwd();

    const syncRun = new syncRunService({
        writeToDb: false,
        nangoConnection,
        syncName,
        syncType: SyncType.INITIAL,
        loadLocation: path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}`)
    });

    try {
        const secretKey = process.env['NANGO_SECRET_KEY'];
        const results = await syncRun.run(lastSyncDate, true, secretKey, hostport);
        console.log(JSON.stringify(results, null, 2));
        process.exit(0);
    } catch (e) {
        process.exit(1);
    }
};

export const tsc = () => {
    const cwd = process.cwd();
    const tsconfig = fs.readFileSync(`${getNangoRootPath()}/tsconfig.dev.json`, 'utf8');

    const distDir = path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist`);

    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir);
    }

    if (!fs.existsSync(`${NANGO_INTEGRATIONS_LOCATION}/${TYPES_FILE_NAME}`)) {
        createModelFile();
    }

    const rawNangoIntegrationLocation = NANGO_INTEGRATIONS_LOCATION.replace('./', '');

    const compiler = tsNode.create({
        compilerOptions: JSON.parse(tsconfig).compilerOptions
    });

    const integrationFiles = glob.sync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/*.ts`));
    for (const filePath of integrationFiles) {
        try {
            if (!nangoCallsAreAwaited(filePath)) {
                return;
            }
            const result = compiler.compile(fs.readFileSync(filePath, 'utf8'), filePath);
            const jsFilePath = path.join(path.dirname(filePath), path.basename(filePath, '.ts') + '.js');
            const distJSFilePath = jsFilePath.replace(rawNangoIntegrationLocation, `${rawNangoIntegrationLocation}/dist`);

            fs.writeFileSync(distJSFilePath, result);
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

export const tscWatch = () => {
    const cwd = process.cwd();
    const tsconfig = fs.readFileSync(`${getNangoRootPath()}/tsconfig.dev.json`, 'utf8');

    const watchPath = [`${NANGO_INTEGRATIONS_LOCATION}/*.ts`, `${NANGO_INTEGRATIONS_LOCATION}/${nangoConfigFile}`];
    const rawNangoIntegrationLocation = NANGO_INTEGRATIONS_LOCATION.replace('./', '');

    const watcher = chokidar.watch(watchPath, {
        ignoreInitial: false,
        ignored: (filePath: string) => {
            return filePath === `${rawNangoIntegrationLocation}/${TYPES_FILE_NAME}`;
        }
    });

    const distDir = path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist`);

    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir);
    }

    if (!fs.existsSync(`${NANGO_INTEGRATIONS_LOCATION}/${TYPES_FILE_NAME}`)) {
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

export const configWatch = () => {
    const watchPath = `${NANGO_INTEGRATIONS_LOCATION}/${nangoConfigFile}`;
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
export const dockerRun = async () => {
    const cwd = process.cwd();

    child = spawn('docker', ['compose', '-f', `${getNangoRootPath()}/docker/docker-compose.yaml`, '--project-directory', '.', 'up', '--build'], {
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
