import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import chokidar from 'chokidar';
import ejs from 'ejs';
import * as dotenv from 'dotenv';
import { spawn } from 'child_process';
import type { ChildProcess } from 'node:child_process';

import { NANGO_INTEGRATIONS_NAME, getNangoRootPath, getPkgVersion, printDebug } from './utils.js';
import { loadYamlAndGenerate } from './services/model.service.js';
import { TYPES_FILE_NAME, exampleSyncName } from './constants.js';
import { compileAllFiles, compileSingleFile, getFileToCompile } from './services/compile.service.js';
import { getLayoutMode } from './utils/layoutMode.js';
import { getProviderConfigurationFromPath, nangoConfigFile } from '@nangohq/nango-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

export const version = (debug: boolean) => {
    if (debug) {
        printDebug('Looking up the version first for a local path first then globally');
    }
    const version = getPkgVersion();

    console.log(chalk.green('Nango CLI version:'), version);
};

export function generate({ fullPath, debug = false }: { fullPath: string; debug?: boolean }) {
    const syncTemplateContents = fs.readFileSync(path.resolve(__dirname, './templates/sync.ejs'), 'utf8');
    const actionTemplateContents = fs.readFileSync(path.resolve(__dirname, './templates/action.ejs'), 'utf8');
    const githubExampleTemplateContents = fs.readFileSync(path.resolve(__dirname, './templates/github.sync.ejs'), 'utf8');
    const postConnectionTemplateContents = fs.readFileSync(path.resolve(__dirname, './templates/post-connection.ejs'), 'utf8');

    const res = loadYamlAndGenerate({ fullPath, debug });
    if (!res.success) {
        return;
    }

    const parsed = res.response!;
    const allSyncNames: Record<string, boolean> = {};

    for (const integration of parsed.integrations) {
        const { syncs, actions, postConnectionScripts, providerConfigKey } = integration;

        if (postConnectionScripts) {
            const type = 'post-connection-script';
            for (const name of postConnectionScripts) {
                const rendered = ejs.render(postConnectionTemplateContents, {
                    interfaceFileName: TYPES_FILE_NAME.replace('.ts', '')
                });
                const stripped = rendered.replace(/^\s+/, '');

                if (!fs.existsSync(path.resolve(fullPath, `${providerConfigKey}/${type}s/${name}.ts`))) {
                    fs.mkdirSync(path.resolve(fullPath, `${providerConfigKey}/${type}s`), { recursive: true });
                    fs.writeFileSync(path.resolve(fullPath, `${providerConfigKey}/${type}s/${name}.ts`), stripped);
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

        for (const flow of [...syncs, ...actions]) {
            const { name, type, output, input } = flow;
            const layoutMode = getLayoutMode({ fullPath, providerConfigKey, scriptName: name, type });
            const uniqueName = layoutMode === 'root' ? name : `${providerConfigKey}-${name}`;

            if (allSyncNames[uniqueName] === undefined) {
                // a sync and an action within the same provider cannot have the same name
                allSyncNames[uniqueName] = true;
            } else {
                console.log(chalk.red(`The ${type} name ${name} is duplicated in the ${nangoConfigFile} file. All sync and action names must be unique.`));
                process.exit(1);
            }

            if (fs.existsSync(path.resolve(fullPath, `${name}.ts`)) || fs.existsSync(path.resolve(fullPath, `${providerConfigKey}/${type}s/${name}.ts`))) {
                if (debug) {
                    printDebug(`${name}.ts file already exists, so will not overwrite it.`);
                }
                continue;
            }

            if (debug) {
                printDebug(`Generating ${name} integration in layout mode ${layoutMode}`);
            }

            const flowNameCamel = name
                .split('-')
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join('');

            let ejsTemplateContents = '';

            if (name === exampleSyncName && type === 'sync') {
                ejsTemplateContents = githubExampleTemplateContents;
            } else {
                ejsTemplateContents = type === 'sync' ? syncTemplateContents : actionTemplateContents;
            }

            const models = (output ? [...output, input] : [input]).filter(Boolean);
            const rendered = ejs.render(ejsTemplateContents, {
                syncName: flowNameCamel,
                interfacePath: layoutMode === 'root' ? './' : '../../',
                interfaceFileName: TYPES_FILE_NAME.replace('.ts', ''),
                output: output && output.length > 0 ? output.join(' | ') : null,
                input: input,
                modelNames: models.join(', '),
                hasWebhook: type === 'sync' && flow.webhookSubscriptions && flow.webhookSubscriptions.length > 0
            });

            const stripped = rendered.replace(/^\s+/, '');

            if (layoutMode === 'root') {
                fs.writeFileSync(path.resolve(fullPath, `${name}.ts`), stripped);
            } else {
                fs.mkdirSync(path.resolve(fullPath, `${providerConfigKey}/${type}s`), { recursive: true });
                fs.writeFileSync(path.resolve(fullPath, `${providerConfigKey}/${type}s/${name}.ts`), stripped);
            }
            if (debug) {
                console.log(chalk.green(`Created ${name}.ts file`));
            }
        }
    }
}

/**
 * Init
 * If we're not currently in the nango-integrations directory create one
 * and create an example nango.yaml file
 */
export function init({ absolutePath, debug = false }: { absolutePath: string; debug?: boolean }) {
    const yamlData = fs.readFileSync(path.resolve(__dirname, `./templates/${nangoConfigFile}`), 'utf8');

    // if currently in the nango-integrations directory then don't create another one
    const currentDirectory = path.basename(absolutePath);
    let fullPath: string;

    if (currentDirectory === NANGO_INTEGRATIONS_NAME) {
        if (debug) {
            printDebug(`Currently in the ${NANGO_INTEGRATIONS_NAME} directory so the directory will not be created`);
        }
        fullPath = absolutePath;
    } else {
        fullPath = path.resolve(absolutePath, NANGO_INTEGRATIONS_NAME);
    }

    if (fs.existsSync(fullPath)) {
        console.log(chalk.red(`The ${NANGO_INTEGRATIONS_NAME} directory already exists. You should run commands from within this directory`));
    } else {
        if (debug) {
            printDebug(`Creating the nango integrations directory at ${absolutePath}`);
        }
        fs.mkdirSync(fullPath);
    }

    const configFileLocation = path.resolve(fullPath, nangoConfigFile);
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

    const envFileLocation = path.resolve(fullPath, '.env');
    if (!fs.existsSync(envFileLocation)) {
        if (debug) {
            printDebug(`Creating the .env file at ${envFileLocation}`);
        }
        fs.writeFileSync(
            envFileLocation,
            `# Authenticates the CLI (get the keys in the dashboard's Environment Settings).
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

    const gitIgnoreFileLocation = path.resolve(fullPath, '.gitignore');
    if (!fs.existsSync(gitIgnoreFileLocation)) {
        if (debug) {
            printDebug(`Creating the .gitignore file at ${gitIgnoreFileLocation}`);
        }
        fs.writeFileSync(
            gitIgnoreFileLocation,
            `dist
.env
`
        );
    } else {
        if (debug) {
            printDebug(`.gitignore file already exists at ${gitIgnoreFileLocation} so not creating a new one`);
        }
    }

    generate({ debug, fullPath });
}

export function tscWatch({ fullPath, debug = false }: { fullPath: string; debug?: boolean }) {
    const tsconfig = fs.readFileSync(path.resolve(getNangoRootPath(), 'tsconfig.dev.json'), 'utf8');
    const res = loadYamlAndGenerate({ fullPath, debug });
    if (!res.success) {
        console.log(chalk.red(res.error?.message));
        if (res.error?.payload) {
            console.log(res.error.payload);
        }
        return;
    }

    const parsed = res.response!;
    const watchPath = ['./**/*.ts', `./${nangoConfigFile}`];

    if (debug) {
        printDebug(`Watching ${watchPath.join(', ')}`);
    }

    const watcher = chokidar.watch(watchPath, {
        ignoreInitial: false,
        ignored: (filePath: string) => {
            const relativePath = path.relative(__dirname, filePath);
            return relativePath.includes('node_modules') || path.basename(filePath) === TYPES_FILE_NAME;
        }
    });

    const distDir = path.join(fullPath, 'dist');

    if (!fs.existsSync(distDir)) {
        if (debug) {
            printDebug(`Creating ${distDir} directory`);
        }
        fs.mkdirSync(distDir);
    }

    watcher.on('add', async (filePath: string) => {
        if (filePath === nangoConfigFile) {
            return;
        }
        await compileSingleFile({ fullPath, file: getFileToCompile({ fullPath, filePath }), tsconfig, parsed, debug });
    });

    watcher.on('unlink', (filePath: string) => {
        if (filePath === nangoConfigFile) {
            return;
        }
        const providerConfiguration = getProviderConfigurationFromPath({ filePath, parsed });
        const baseName = path.basename(filePath, '.ts');
        const fileName = providerConfiguration ? `${baseName}-${providerConfiguration.providerConfigKey}.js` : `${baseName}.js`;
        const jsFilePath = `./dist/${fileName}`;

        try {
            fs.unlinkSync(jsFilePath);
        } catch {
            console.log(chalk.red(`Error deleting ${jsFilePath}`));
        }
    });

    watcher.on('change', async (filePath: string) => {
        if (filePath === nangoConfigFile) {
            await compileAllFiles({ fullPath, debug });
            return;
        }
        await compileSingleFile({ fullPath, file: getFileToCompile({ fullPath, filePath }), tsconfig, parsed, debug });
    });
}

export function configWatch({ fullPath, debug = false }: { fullPath: string; debug?: boolean }) {
    const watchPath = path.join(fullPath, nangoConfigFile);
    if (debug) {
        printDebug(`Watching ${watchPath}`);
    }
    const watcher = chokidar.watch(watchPath, { ignoreInitial: true });

    watcher.on('change', () => {
        loadYamlAndGenerate({ fullPath, debug });
    });
}

let child: ChildProcess | undefined;
process.on('SIGINT', () => {
    if (child) {
        const dockerDown = spawn('docker', ['compose', '-f', path.join(getNangoRootPath(), 'docker/docker-compose.yaml'), '--project-directory', '.', 'down'], {
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

    const args = ['compose', '-f', path.join(getNangoRootPath(), 'docker/docker-compose.yaml'), '--project-directory', '.', 'up', '--build'];

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
