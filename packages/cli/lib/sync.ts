import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import chalk from 'chalk';
import chokidar from 'chokidar';
import * as tsNode from 'ts-node';
import glob from 'glob';
import * as dotenv from 'dotenv';
import { spawn } from 'child_process';

import type { NangoConfig, Connection as NangoConnection, NangoIntegrationData } from '@nangohq/shared';
import { Nango, loadNangoConfig, getIntegrationClass, getServerBaseUrl, getLastSyncDate, syncDataService } from '@nangohq/shared';
import { getConnection, configFile, NANGO_INTEGRATIONS_LOCATION, buildInterfaces } from './utils.js';

dotenv.config();

interface RunArgs {
    sync: string;
    provider: string;
    connection: string;
    lastSyncDate?: string;
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
                title: 'char',
                description: 'char',
                status: 'char',
                author: {
                    avatar_url: 'char'
                }
            },
            projects: {
                id: 'integer',
                type: 'char'
            },
            users: {
                id: 'integer',
                name: 'char'
            }
        }
    };
    const yamlData = yaml.dump(data);

    if (!fs.existsSync(NANGO_INTEGRATIONS_LOCATION)) {
        fs.mkdirSync(NANGO_INTEGRATIONS_LOCATION);
    }
    fs.writeFileSync(`${NANGO_INTEGRATIONS_LOCATION}/${configFile}`, yamlData);

    console.log(chalk.green(`${configFile} file has been created`));
};

export const verifyAndChangeDistFilesToJs = () => {
    const cwd = process.cwd();
    const distFiles = fs.readdirSync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist`));
    distFiles.forEach((file) => {
        if (file.endsWith('.mjs')) {
            fs.renameSync(
                path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist/${file}`),
                path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist/${file.replace('.mjs', '.js')}`)
            );
        }
    });
};

export const run = async (args: string[], options: RunArgs) => {
    verifyAndChangeDistFilesToJs();
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

    const cwd = process.cwd();
    const config = await loadNangoConfig(null, syncName, path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/${configFile}`));

    if (!config) {
        throw new Error(`Error loading the ${configFile} file`);
    }

    let lastSyncDate;

    if (suppliedLastSyncDate) {
        lastSyncDate = new Date(suppliedLastSyncDate as string);
    }

    if (
        config?.integrations?.[providerConfigKey as string]?.[syncName as string] &&
        fs.existsSync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist/${syncName}.js`))
    ) {
        const syncData = config?.integrations[providerConfigKey as string]?.[syncName as string];
        // to load a module without having to edit the type in the package.json
        // edit the file to be a mjs then rename it back
        fs.renameSync(
            path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist/${syncName}.js`),
            path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist/${syncName}.mjs`)
        );
        const integrationClass = await getIntegrationClass(
            syncName as string,
            path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist/${syncName}.mjs`) + `?v=${Math.random().toString(36).substring(3)}`
        );

        const nango = new Nango({
            host: getServerBaseUrl(),
            connectionId: String(connectionId),
            providerConfigKey: String(providerConfigKey),
            isSync: true
        });

        try {
            const nangoConnection = (await getConnection(providerConfigKey as string, connectionId as string)) as unknown as NangoConnection;
            if (!lastSyncDate) {
                lastSyncDate = (await getLastSyncDate(nangoConnection?.id as number, syncName)) as Date;
            }
            if (lastSyncDate instanceof Date && !isNaN(lastSyncDate.getTime())) {
                nango.setLastSyncDate(lastSyncDate);
            }
            const userDefinedResults = await integrationClass.fetchData(nango);
            console.log(JSON.stringify(userDefinedResults, null, 2));
            fs.renameSync(
                path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist/${syncName}.mjs`),
                path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist/${syncName}.js`)
            );
            const { returns: models } = syncData as NangoIntegrationData;

            for (const model of models) {
                if (userDefinedResults[model]) {
                    const { isUnique, nonUniqueKey } = syncDataService.verifyUniqueKeysAreUnique(userDefinedResults[model]);
                    if (!isUnique) {
                        console.log(
                            chalk.red(
                                `The ${model} model does not have unique id keys! The repeated key is ${nonUniqueKey}. Please resolve this before running the sync on the server.`
                            )
                        );
                    }
                }
            }

            process.exit(0);
        } catch (error) {
            console.error(error);
            fs.renameSync(
                path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist/${syncName}.mjs`),
                path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/dist/${syncName}.js`)
            );
            process.exit(1);
        }
    } else {
        console.log(chalk.red('Sync not found'));
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

            console.log(chalk.green(`Compiled ${filePath} successfully`));
        } catch (error) {
            console.error(`Error compiling ${filePath}:`);
            console.error(error);
        }
    }
};

export const tscWatch = () => {
    const cwd = process.cwd();
    const tsconfig = fs.readFileSync('./node_modules/nango/tsconfig.dev.json', 'utf8');

    const watchPath = [`${NANGO_INTEGRATIONS_LOCATION}/*.ts`, `${NANGO_INTEGRATIONS_LOCATION}/${configFile}`];
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
        if (filePath === `${rawNangoIntegrationLocation}/${configFile}`) {
            return;
        }
        compileFile(filePath);
    });

    watcher.on('change', (filePath) => {
        if (filePath === `${rawNangoIntegrationLocation}/${configFile}`) {
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
    const watchPath = `${NANGO_INTEGRATIONS_LOCATION}/${configFile}`;
    const watcher = chokidar.watch(watchPath, { ignoreInitial: true });

    watcher.on('add', (filePath) => {
        buildInterface(filePath);
    });

    watcher.on('change', (filePath) => {
        buildInterface(filePath);
    });

    function buildInterface(filePath: string) {
        const cwd = process.cwd();
        const configContents = fs.readFileSync(path.resolve(cwd, `${NANGO_INTEGRATIONS_LOCATION}/${configFile}`), 'utf8');
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
