import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import chalk from 'chalk';
import chokidar from 'chokidar';
import * as dotenv from 'dotenv';
import ejs from 'ejs';

import { getProviderConfigurationFromPath, nangoConfigFile } from '@nangohq/nango-yaml';

import { TYPES_FILE_NAME, exampleSyncName } from './constants.js';
import { compileAllFiles, compileSingleFile, getFileToCompile } from './services/compile.service.js';
import { loadYamlAndGenerate } from './services/model.service.js';
import { getLayoutMode } from './utils/layoutMode.js';
import { getNangoRootPath, printDebug } from './utils.js';
import { NANGO_VERSION } from './version.js';

import type { NangoYamlParsed } from '@nangohq/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

export const version = (debug: boolean) => {
    if (debug) {
        printDebug('Looking up the version first for a local path first then globally');
    }
    const version = NANGO_VERSION;

    console.log(chalk.green('Nango CLI version:'), version);
};

export function generate({ fullPath, debug = false }: { fullPath: string; debug?: boolean }) {
    const syncTemplateContents = fs.readFileSync(path.resolve(__dirname, './templates/sync.ejs'), 'utf8');
    const actionTemplateContents = fs.readFileSync(path.resolve(__dirname, './templates/action.ejs'), 'utf8');
    const githubExampleTemplateContents = fs.readFileSync(path.resolve(__dirname, './templates/github.sync.ejs'), 'utf8');
    const onEventTemplateContents = fs.readFileSync(path.resolve(__dirname, './templates/on-event.ejs'), 'utf8');

    const parsed = loadYamlAndGenerate({ fullPath, debug });
    if (!parsed) {
        return;
    }

    const allSyncNames: Record<string, boolean> = {};

    for (const integration of parsed.integrations) {
        const { syncs, actions, onEventScripts, providerConfigKey } = integration;

        if (onEventScripts) {
            const type = 'on-event';
            for (const name of Object.values(onEventScripts).flat()) {
                const rendered = ejs.render(onEventTemplateContents, {
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

function showCompilationMessage(failedFiles: Set<string>) {
    if (failedFiles.size === 0) {
        console.log(chalk.green('No compilation errors.'));
    }
}

export function tscWatch({ fullPath, debug = false, watchConfigFile }: { fullPath: string; debug?: boolean; watchConfigFile: boolean }) {
    const tsconfig = fs.readFileSync(path.resolve(getNangoRootPath(), 'tsconfig.dev.json'), 'utf8');

    const watchPath = ['./**/*.ts'];
    if (watchConfigFile) {
        watchPath.push(`./${nangoConfigFile}`);
    }

    if (debug) {
        printDebug(`Watching ${watchPath.join(', ')}`);
    }

    const watcher = chokidar.watch(watchPath, {
        ignoreInitial: false,
        ignored: (filePath: string) => {
            const relativePath = path.relative(__dirname, filePath);
            return relativePath.includes('node_modules') || path.basename(filePath) === TYPES_FILE_NAME || relativePath.includes('.nango');
        }
    });

    const distDir = path.join(fullPath, 'dist');

    if (!fs.existsSync(distDir)) {
        if (debug) {
            printDebug(`Creating ${distDir} directory`);
        }
        fs.mkdirSync(distDir);
    }

    // First parsing of the config file
    let parsed: NangoYamlParsed | null = loadYamlAndGenerate({ fullPath, debug });

    const failedFiles = new Set<string>();

    watcher.on('add', (filePath: string) => {
        async function onAdd() {
            if (filePath === nangoConfigFile || !parsed) {
                return;
            }
            const success = await compileSingleFile({
                fullPath,
                file: getFileToCompile({ fullPath, filePath }),
                tsconfig,
                parsed,
                debug
            });
            if (success) {
                failedFiles.delete(filePath);
            } else {
                failedFiles.add(filePath);
            }
            showCompilationMessage(failedFiles);
        }

        void onAdd();
    });

    watcher.on('change', (filePath: string) => {
        async function onChange() {
            if (filePath === nangoConfigFile) {
                parsed = loadYamlAndGenerate({ fullPath, debug });

                if (!parsed) {
                    return;
                }

                const { failedFiles: newFailedFiles } = await compileAllFiles({ fullPath, debug });
                failedFiles.clear();
                for (const file of newFailedFiles) {
                    failedFiles.add(file);
                }
                showCompilationMessage(failedFiles);
                return;
            }

            if (!parsed) {
                return;
            }

            const success = await compileSingleFile({ fullPath, file: getFileToCompile({ fullPath, filePath }), parsed, debug });
            if (success) {
                failedFiles.delete(filePath);
            } else {
                failedFiles.add(filePath);
            }
            showCompilationMessage(failedFiles);
        }

        void onChange();
    });

    watcher.on('unlink', (filePath: string) => {
        if (filePath === nangoConfigFile || !parsed) {
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
