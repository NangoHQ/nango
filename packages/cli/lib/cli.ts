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

import type { NangoConfig } from '@nangohq/shared';
import { nangoConfigFile, SyncConfigType, JAVASCRIPT_PRIMITIVES } from '@nangohq/shared';
import { NANGO_INTEGRATIONS_NAME, getNangoRootPath, printDebug } from './utils.js';
import configService from './services/config.service.js';
import modelService from './services/model.service.js';
import parserService from './services/parser.service.js';
import { NangoSyncTypesFileLocation, TYPES_FILE_NAME, exampleSyncName } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

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
    const syncTemplateContents = fs.readFileSync(path.resolve(__dirname, './templates/sync.ejs'), 'utf8');
    const actionTemplateContents = fs.readFileSync(path.resolve(__dirname, './templates/action.ejs'), 'utf8');
    const githubExampleTemplateContents = fs.readFileSync(path.resolve(__dirname, './templates/github.sync.ejs'), 'utf8');

    const configContents = fs.readFileSync(`${dirPrefix}/${nangoConfigFile}`, 'utf8');
    const configData: NangoConfig = yaml.load(configContents) as unknown as NangoConfig;
    const { models, integrations } = configData;

    const interfaceDefinitions = modelService.build(models, integrations, debug);

    if (interfaceDefinitions) {
        fs.writeFileSync(`${dirPrefix}/${TYPES_FILE_NAME}`, interfaceDefinitions.join('\n'));
    }

    if (debug) {
        printDebug(`Interfaces from the ${nangoConfigFile} file written to ${TYPES_FILE_NAME}`);
    }

    // insert NangoSync types to the bottom of the file
    const typesContent = fs.readFileSync(`${getNangoRootPath()}/${NangoSyncTypesFileLocation}`, 'utf8');
    fs.writeFileSync(`${dirPrefix}/${TYPES_FILE_NAME}`, typesContent, { flag: 'a' });

    const { success, error, response: config } = await configService.load(dirPrefix, debug);

    if (!success || !config) {
        console.log(chalk.red(error?.message));
        return;
    }

    const flowConfig = `export const NangoFlows = ${JSON.stringify(config, null, 2)} as const; \n`;
    fs.writeFileSync(`${dirPrefix}/${TYPES_FILE_NAME}`, flowConfig, { flag: 'a' });

    if (debug) {
        printDebug(`NangoSync types written to ${TYPES_FILE_NAME}`);
    }

    const allSyncNames: Record<string, boolean> = {};

    for (const standardConfig of config) {
        const { syncs, actions } = standardConfig;

        for (const flow of [...syncs, ...actions]) {
            const { name, type, returns: models, input } = flow;

            if (allSyncNames[name] === undefined) {
                allSyncNames[name] = true;
            } else {
                console.log(chalk.red(`The ${type} name ${name} is duplicated in the ${nangoConfigFile} file. All sync names must be unique.`));
                process.exit(1);
            }

            if (debug) {
                printDebug(`Generating ${name} integration`);
            }

            const flowNameCamel = name
                .split('-')
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join('');

            let ejsTemplateContents = '';

            if (name === exampleSyncName && type === SyncConfigType.SYNC) {
                ejsTemplateContents = githubExampleTemplateContents;
            } else {
                ejsTemplateContents = type === SyncConfigType.SYNC ? syncTemplateContents : actionTemplateContents;
            }

            const formatModelName = (model: string) => {
                if (JAVASCRIPT_PRIMITIVES.includes(model)) {
                    return '';
                }
                const singularModel = model.charAt(model.length - 1) === 's' ? model.slice(0, -1) : model;
                return `${singularModel.charAt(0).toUpperCase()}${singularModel.slice(1)}`;
            };

            let interfaceNames: string | string[] = [];
            let mappings: { name: string; type: string } | { name: string; type: string }[] = [];

            if (typeof models === 'string') {
                const formattedName = formatModelName(models);
                interfaceNames = formattedName;
                mappings = {
                    name: models,
                    type: formattedName
                };
            } else {
                if (models && models.length !== 0) {
                    interfaceNames = models.map(formatModelName);
                    mappings = models.map((model) => ({
                        name: model,
                        type: formatModelName(model)
                    }));
                }
            }

            const rendered = ejs.render(ejsTemplateContents, {
                syncName: flowNameCamel,
                interfaceFileName: TYPES_FILE_NAME.replace('.ts', ''),
                interfaceNames,
                mappings,
                inputs: input && Object.keys(input).length > 0 ? input : '',
                hasWebhook: type === SyncConfigType.SYNC && flow.webhookSubscriptions && flow.webhookSubscriptions.length > 0
            });

            const stripped = rendered.replace(/^\s+/, '');

            if (!fs.existsSync(`${dirPrefix}/${name}.ts`)) {
                fs.writeFileSync(`${dirPrefix}/${name}.ts`, stripped);
                if (debug) {
                    printDebug(`Created ${name}.ts file`);
                }
            } else {
                if (debug) {
                    printDebug(`${name}.ts file already exists, so will not overwrite it.`);
                }
            }
        }
    }
};

/**
 * Init
 * If we're not currently in the nango-integrations directory create one
 * and create an example nango.yaml file
 */
export const init = async (debug = false) => {
    const yamlData = fs.readFileSync(path.resolve(__dirname, `./templates/${nangoConfigFile}`), 'utf8');

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

export const tscWatch = async (debug = false) => {
    const tsconfig = fs.readFileSync(`${getNangoRootPath()}/tsconfig.dev.json`, 'utf8');
    const { success, error, response: config } = await configService.load();

    if (!success || !config) {
        console.log(chalk.red(error?.message));
        return;
    }

    const modelNames = configService.getModelNames(config);

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
        await modelService.createModelFile();
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
            const providerConfiguration = config?.find((config) =>
                [...config.syncs, ...config.actions].find((sync) => sync.name === path.basename(filePath, '.ts'))
            );
            if (!providerConfiguration) {
                return;
            }
            const syncConfig = [...providerConfiguration.syncs, ...providerConfiguration.actions].find((sync) => sync.name === path.basename(filePath, '.ts'));

            const type = syncConfig?.type || SyncConfigType.SYNC;

            if (!parserService.callsAreUsedCorrectly(filePath, type, modelNames)) {
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

    watcher.on('change', async () => {
        await modelService.createModelFile(true);
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
