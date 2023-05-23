import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import chalk from 'chalk';
import chokidar from 'chokidar';
import * as tsNode from 'ts-node';

import type { NangoConfig, Connection as NangoConnection } from '@nangohq/shared';
import { Nango, loadNangoConfig, getIntegrationClass, getServerBaseUrl, getLastSyncDate } from '@nangohq/shared';
import { getConnection } from './utils.js';
export const configFile = 'nango.yaml';

const dir = 'nango-integrations';

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

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
    fs.writeFileSync(`${dir}/${configFile}`, yamlData);

    console.log(chalk.green(`${configFile} file has been created`));
};

export const run = async (args: string[]) => {
    const [syncName, providerConfigKey, connectionId, suppliedLastSyncDate] = args;

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
    const config = loadNangoConfig(path.resolve(cwd, `./nango-integrations/${configFile}`));
    let lastSyncDate;

    if (suppliedLastSyncDate) {
        lastSyncDate = new Date(suppliedLastSyncDate as string);
    }

    if (
        config?.integrations?.[providerConfigKey as string]?.[syncName as string] &&
        fs.existsSync(path.resolve(cwd, `./nango-integrations/dist/${syncName}.js`))
    ) {
        // to load a module without having to edit the type in the package.json
        // edit the file to be a mjs then rename it back
        fs.renameSync(path.resolve(cwd, `./nango-integrations/dist/${syncName}.js`), path.resolve(cwd, `./nango-integrations/dist/${syncName}.mjs`));
        const integrationClass = await getIntegrationClass(
            syncName as string,
            path.resolve(cwd, `./nango-integrations/dist/${syncName}.mjs`) + `?v=${Math.random().toString(36).substring(3)}`
        );

        // look at the cli index on how to get the nangoConnection
        const nango = new Nango({
            host: getServerBaseUrl(),
            connectionId: String(connectionId),
            providerConfigKey: String(providerConfigKey)
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
            console.log(userDefinedResults);
            fs.renameSync(path.resolve(cwd, `./nango-integrations/dist/${syncName}.mjs`), path.resolve(cwd, `./nango-integrations/dist/${syncName}.js`));
            process.exit(0);
        } catch (error) {
            console.error(error);
            fs.renameSync(path.resolve(cwd, `./nango-integrations/dist/${syncName}.mjs`), path.resolve(cwd, `./nango-integrations/dist/${syncName}.js`));
            process.exit(1);
        }
    } else {
        console.log(chalk.red('Sync not found'));
    }
};

export const tscWatch = () => {
    const cwd = process.cwd();
    const tsconfig = fs.readFileSync('./node_modules/nango/tsconfig.dev.json', 'utf8');

    const watchPath = './nango-integrations/*.ts';
    const watcher = chokidar.watch(watchPath, { ignoreInitial: true });

    const distDir = path.resolve(cwd, './nango-integrations/dist');

    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir);
    }

    const compiler = tsNode.create({
        compilerOptions: JSON.parse(tsconfig).compilerOptions
    });

    watcher.on('add', (filePath) => {
        compileFiile(filePath);
    });

    watcher.on('change', (filePath) => {
        compileFiile(filePath);
    });

    function compileFiile(filePath: string) {
        try {
            console.log(filePath);
            const result = compiler.compile(fs.readFileSync(filePath, 'utf8'), filePath);
            const jsFilePath = path.join(path.dirname(filePath), path.basename(filePath, '.ts') + '.js');
            const distJSFilePath = jsFilePath.replace('nango-integrations', 'nango-integrations/dist');
            fs.writeFileSync(distJSFilePath, result);
            console.log(chalk.green(`Compiled ${filePath} successfully`));
        } catch (error) {
            console.error(`Error compiling ${filePath}:`);
            console.error(error);
            return;
        }
    }
};
