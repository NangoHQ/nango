import fs from 'fs';
import chalk from 'chalk';
import promptly from 'promptly';
import path from 'path';

import { nangoConfigFile } from '@nangohq/nango-yaml';
import { parse } from './config.service.js';
import { compileAllFiles, listFilesToCompile } from './compile.service.js';
import { printDebug } from '../utils.js';
import { NANGO_INTEGRATIONS_NAME } from '../constants.js';
import { init, generate } from '../cli.js';

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

        if (currentDirectory !== NANGO_INTEGRATIONS_NAME) {
            console.log(chalk.red(`You must run this command in the ${NANGO_INTEGRATIONS_NAME} directory.`));
            process.exit(1);
        }

        if (!fs.existsSync(path.join(fullPath, nangoConfigFile))) {
            const install = autoConfirm
                ? true
                : await promptly.confirm(`No ${nangoConfigFile} file was found. Would you like to create some default integrations and build them? (yes/no)`);

            if (install) {
                if (debug) {
                    printDebug(`Running init, generate, and tsc to create ${nangoConfigFile} file, generate the integration files and then compile them.`);
                }
                init({ absolutePath: fullPath, debug });
                generate({ fullPath, debug });
                await compileAllFiles({ fullPath, debug });
            } else {
                console.log(chalk.red(`Exiting...`));
                process.exit(1);
            }
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

        const tsFileNames = tsFiles.filter((file) => !file.inputPath.includes('models.ts')).map((file) => file.baseName);

        const missingFiles = flows.filter((scriptName) => !tsFileNames.includes(scriptName));

        if (missingFiles.length > 0) {
            console.log(chalk.red(`The following scripts are missing a corresponding .ts file: ${missingFiles.join(', ')}`));
            throw new Error('Script missing .ts files');
        }

        return true;
    }
}

const verificationService = new VerificationService();
export default verificationService;
