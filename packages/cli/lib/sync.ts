import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import chalk from 'chalk';
import chokidar from 'chokidar';
import * as tsNode from 'ts-node';
import glob from 'glob';
import * as dotenv from 'dotenv';
import { spawn } from 'child_process';

import type { NangoConfig, Connection as NangoConnection } from '@nangohq/shared';
import { cloudHost, stagingHost, SyncType, syncRunService, nangoConfigFile } from '@nangohq/shared';
import { hostport, getConnection, NANGO_INTEGRATIONS_LOCATION, buildInterfaces } from './utils.js';

dotenv.config();

interface RunArgs {
    sync: string;
    provider: string;
    connection: string;
    lastSyncDate?: string;
    useServerLastSyncDate?: boolean;
}

export const init = () => {
    const data: NangoConfig = {
        integrations: {
            'github-prod': {
                'github-users': {
                    runs: 'every hour',
                    returns: ['users']
                },
                'github-issues': {
                    runs: 'every half hour',
                    returns: ['issues']
                }
            },
            'asana-dev': {
                'asana-projects': {
                    runs: 'every hour',
                    returns: ['projects']
                }
            }
        },
        models: {
            issues: {
                id: 'integer',
                title: 'string',
                description: 'string',
                status: 'string',
                author: {
                    avatar_url: 'string'
                }
            },
            projects: {
                id: 'number',
                type: 'string'
            },
            users: {
                id: 'number',
                name: 'string'
            }
        }
    };
    const yamlData = yaml.dump(data);

    if (!fs.existsSync(NANGO_INTEGRATIONS_LOCATION)) {
        fs.mkdirSync(NANGO_INTEGRATIONS_LOCATION);
    }
    fs.writeFileSync(`${NANGO_INTEGRATIONS_LOCATION}/${nangoConfigFile}`, yamlData);

    console.log(chalk.green(`${nangoConfigFile} file has been created`));
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
        console.log(results);
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
        ignored: (filePath) => {
            return filePath === `${rawNangoIntegrationLocation}/models.ts`;
        }
    });

    const distDir = path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist`);

    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir);
    }

    watcher.on('add', (filePath) => {
        if (filePath === `${rawNangoIntegrationLocation}/${nangoConfigFile}`) {
            return;
        }
        compileFile(filePath);
    });

    watcher.on('change', (filePath) => {
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

    watcher.on('add', (filePath) => {
        buildInterface(filePath);
    });

    watcher.on('change', (filePath) => {
        buildInterface(filePath);
    });

    function buildInterface(filePath: string) {
        const cwd = process.cwd();
        const configContents = fs.readFileSync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/${nangoConfigFile}`), 'utf8');
        const configData: NangoConfig = yaml.load(configContents) as unknown as NangoConfig;
        const { models } = configData;
        const interfaces = buildInterfaces(models);
        fs.writeFileSync(`${NANGO_INTEGRATIONS_LOCATION}/models.ts`, interfaces.join('\n'));
        console.log(
            chalk.green(`${filePath} was updated. The interface file (${NANGO_INTEGRATIONS_LOCATION}/models.ts) was updated to reflect the updated config`)
        );
    }
};

/**
 * Docker Run
 * @desc spawn a child process to run the docker compose located in the cli
 * Look into https://www.npmjs.com/package/docker-compose to avoid dependency maybe?
 */
export const dockerRun = () => {
    const cwd = process.cwd();

    spawn('docker', ['compose', '-f', 'node_modules/nango/docker/docker-compose.yaml', '--project-directory', '.', 'up', '--build'], {
        cwd,
        detached: false,
        stdio: 'inherit'
    });
};
