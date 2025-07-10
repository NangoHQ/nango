import fs from 'fs';
import path from 'path';

import chalk from 'chalk';
import promptly from 'promptly';

import { nangoConfigFile } from '@nangohq/nango-yaml';

import { compileAllFiles, listFilesToCompile } from './compile.service.js';
import { parse } from './config.service.js';
import { generate } from '../cli.js';
import { printDebug } from '../utils.js';

class VerificationService {
    public async necessaryFilesExist({
        fullPath,
        autoConfirm,
        debug = false,
        checkDist = false
    }: {
        fullPath: string;
        autoConfirm: boolean;
        debug?: boolean;
        checkDist?: boolean;
    }) {
        if (debug) {
            printDebug(`Current full working directory is read as: ${fullPath}`);
        }

        const currentDirectory = path.basename(fullPath);
        if (debug) {
            printDebug(`Current stripped directory is read as: ${currentDirectory}`);
        }

        if (!fs.existsSync(path.join(fullPath, nangoConfigFile))) {
            console.log(chalk.red(`Not a Nango project...`));
            process.exit(1);
        } else {
            if (debug) {
                printDebug(`Found ${nangoConfigFile} file successfully.`);
            }
        }

        if (!checkDist) {
            return;
        }

        const distDir = path.join(fullPath, 'dist');

        if (!fs.existsSync(distDir)) {
            if (debug) {
                printDebug("Dist directory doesn't exist.");
            }
            const createDist = autoConfirm
                ? true
                : await promptly.confirm(`No dist directory was found. Would you like to create it and create default integrations? (yes/no)`);

            if (createDist) {
                if (debug) {
                    printDebug(`Creating the dist directory and generating the default integration files.`);
                }
                fs.mkdirSync(distDir);
                generate({ fullPath, debug });
                await compileAllFiles({ fullPath, debug });
            }
        } else {
            const files = fs.readdirSync(distDir);
            if (files.length === 0) {
                if (debug) {
                    printDebug(`Dist directory exists but is empty.`);
                }
                const compile = autoConfirm
                    ? true
                    : await promptly.confirm(`The dist directory is empty. Would you like to generate the default integrations? (yes/no)`);

                if (compile) {
                    if (debug) {
                        printDebug(`Generating the default integration files.`);
                    }
                    await compileAllFiles({ fullPath, debug });
                }
            }
        }
    }

    public filesMatchConfig({ fullPath }: { fullPath: string }): boolean {
        const parsing = parse(fullPath);
        if (parsing.isErr()) {
            console.log(chalk.red(parsing.error.message));
            return false;
        }

        const parser = parsing.value;
        const syncNames = parser.parsed!.integrations.map((provider) => provider.syncs.map((sync) => sync.name)).flat();
        const actionNames = parser.parsed!.integrations.map((provider) => provider.actions.map((action) => action.name)).flat();
        const onEventsScriptNames = parser.parsed!.integrations.map((provider) => Object.values(provider.onEventScripts).flat()).flat();
        const flows = [...syncNames, ...actionNames, ...onEventsScriptNames].filter((name) => name);

        const tsFiles = listFilesToCompile({ fullPath, parsed: parser.parsed! });

        const tsFileNames = tsFiles.filter((file) => file.baseName !== 'models').map((file) => file.baseName);

        const missingFiles = flows.filter((scriptName) => !tsFileNames.includes(scriptName));

        if (missingFiles.length > 0) {
            console.log(chalk.red(`The following scripts are missing a corresponding .ts file: ${missingFiles.join(', ')}`));
            throw new Error('Script missing .ts files');
        }

        return true;
    }

    public async preCheck({
        fullPath,
        debug
    }: {
        fullPath: string;
        debug: boolean;
    }): Promise<{ isNango: boolean; hasNangoYaml: boolean; folderName: string; hasIndexTs: boolean; isZeroYaml: boolean }> {
        const stat = fs.statSync(fullPath, { throwIfNoEntry: false });

        const files = stat ? await fs.promises.readdir(fullPath) : [];

        const hasNangoYaml = files.includes('nango.yaml');
        const hasNangoFolder = files.includes('.nango');
        const hasIndexTs = files.includes('index.ts');
        const isZeroYaml = !hasNangoYaml && hasNangoFolder && hasIndexTs;

        if (isZeroYaml || hasNangoYaml) {
            printDebug(isZeroYaml ? 'Mode: zero yaml' : 'Model: classic yaml', debug);
        }
        return {
            isNango: hasNangoFolder || hasNangoYaml,
            folderName: path.basename(fullPath),
            hasNangoYaml,
            hasIndexTs,
            isZeroYaml
        };
    }

    public async ensureNangoYaml({ fullPath, debug }: { fullPath: string; debug: boolean }) {
        const precheck = await this.preCheck({ fullPath, debug });
        if (!precheck.isNango) {
            console.log(chalk.red(`Not inside a Nango folder`));
            process.exitCode = 1;
            return false;
        }
        if (precheck.isZeroYaml) {
            console.log(chalk.red(`This command only works with a nango.yaml`));
            process.exitCode = 1;
            return false;
        }

        return true;
    }
}

const verificationService = new VerificationService();
export default verificationService;
