import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import chalk from 'chalk';
import chokidar from 'chokidar';
import * as tsNode from 'ts-node';
import glob from 'glob';
import ejs from 'ejs';
import * as dotenv from 'dotenv';
import { spawn } from 'child_process';
import type { ChildProcess } from 'node:child_process';

import type { NangoConfig, Connection as NangoConnection, NangoIntegration, NangoIntegrationData } from '@nangohq/shared';
import { cloudHost, stagingHost, SyncType, syncRunService, nangoConfigFile } from '@nangohq/shared';
import { hostport, getConnection, NANGO_INTEGRATIONS_LOCATION, buildInterfaces } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

interface RunArgs {
    sync: string;
    provider: string;
    connection: string;
    lastSyncDate?: string;
    useServerLastSyncDate?: boolean;
}

const exampleSyncName = 'github-issue-example';

const createModelFile = (notify = false) => {
    if (!fs.existsSync(`${NANGO_INTEGRATIONS_LOCATION}/models.ts`)) {
        const cwd = process.cwd();
        const configContents = fs.readFileSync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/${nangoConfigFile}`), 'utf8');
        const configData: NangoConfig = yaml.load(configContents) as unknown as NangoConfig;
        const { models } = configData;
        const interfaceDefinitions = buildInterfaces(models);
        fs.writeFileSync(`${NANGO_INTEGRATIONS_LOCATION}/models.ts`, interfaceDefinitions.join('\n'));

        if (notify) {
            console.log(
                chalk.green(
                    `${NANGO_INTEGRATIONS_LOCATION}/${nangoConfigFile} was updated. The interface file (${NANGO_INTEGRATIONS_LOCATION}/models.ts) was updated to reflect the updated config`
                )
            );
        }
    }
};

export const version = () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
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

    fs.writeFileSync(`${NANGO_INTEGRATIONS_LOCATION}/models.ts`, interfaceDefinitions.join('\n'));

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
    let syncName, providerConfigKey, connectionId, suppliedLastSyncDate, useServerLastSyncDate;
    if (args.length > 0) {
        [syncName, providerConfigKey, connectionId, suppliedLastSyncDate, useServerLastSyncDate] = args;
    }

    if (Object.keys(options).length > 0) {
        ({ sync: syncName, provider: providerConfigKey, connection: connectionId, lastSyncDate: suppliedLastSyncDate, useServerLastSyncDate } = options);
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

    if (!useServerLastSyncDate) {
        lastSyncDate = null;
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
        const results = await syncRun.run(lastSyncDate, true);
        console.log(JSON.stringify(results, null, 2));
        process.exit(0);
    } catch (e) {
        process.exit(1);
    }
};

export const tsc = () => {
    const cwd = process.cwd();
    const tsconfig = fs.readFileSync('./node_modules/nango/tsconfig.dev.json', 'utf8');

    const distDir = path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist`);

    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir);
    }

    if (!fs.existsSync(`${NANGO_INTEGRATIONS_LOCATION}/models.ts`)) {
        createModelFile();
    }

    const rawNangoIntegrationLocation = NANGO_INTEGRATIONS_LOCATION.replace('./', '');

    const compiler = tsNode.create({
        compilerOptions: JSON.parse(tsconfig).compilerOptions
    });

    const integrationFiles = glob.sync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/*.ts`));
    for (const filePath of integrationFiles) {
        try {
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

export const tscWatch = () => {
    const cwd = process.cwd();
    const tsconfig = fs.readFileSync('./node_modules/nango/tsconfig.dev.json', 'utf8');

    const watchPath = [`${NANGO_INTEGRATIONS_LOCATION}/*.ts`, `${NANGO_INTEGRATIONS_LOCATION}/${nangoConfigFile}`];
    const rawNangoIntegrationLocation = NANGO_INTEGRATIONS_LOCATION.replace('./', '');

    const watcher = chokidar.watch(watchPath, {
        ignoreInitial: false,
        ignored: (filePath: string) => {
            return filePath === `${rawNangoIntegrationLocation}/models.ts`;
        }
    });

    const distDir = path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist`);

    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir);
    }

    if (!fs.existsSync(`${NANGO_INTEGRATIONS_LOCATION}/models.ts`)) {
        createModelFile();
    }

    watcher.on('add', (filePath: string) => {
        if (filePath === `${rawNangoIntegrationLocation}/${nangoConfigFile}`) {
            return;
        }
        compileFile(filePath);
    });

    watcher.on('unlink', (filePath: string) => {
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

    watcher.on('add', () => {
        createModelFile(true);
    });

    watcher.on('change', () => {
        createModelFile(true);
    });
};

let child: ChildProcess | undefined;
process.on('SIGINT', () => {
    if (child) {
        const dockerDown = spawn('docker', ['compose', '-f', 'node_modules/nango/docker/docker-compose.yaml', '--project-directory', '.', 'down'], {
            stdio: 'inherit'
        });
        dockerDown.on('exit', () => {
            process.exit();
        });
    }
});

/**
 * Docker Run
 * @desc spawn a child process to run the docker compose located in the cli
 * Look into https://www.npmjs.com/package/docker-compose to avoid dependency maybe?
 */
export const dockerRun = async () => {
    const cwd = process.cwd();

    child = spawn('docker', ['compose', '-f', 'node_modules/nango/docker/docker-compose.yaml', '--project-directory', '.', 'up', '--build'], {
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
