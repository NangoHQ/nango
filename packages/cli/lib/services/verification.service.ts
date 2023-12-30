import fs from 'fs';
import glob from 'glob';
import chalk from 'chalk';
import path from 'path';
import promptly from 'promptly';

import { nangoConfigFile } from '@nangohq/shared';
import configService from './config.service.js';
import compileService from './compile.service.js';
import { printDebug } from '../utils.js';
import { NANGO_INTEGRATIONS_NAME } from '../constants.js';
import { init, generate } from '../cli.js';

class VerificationService {
    public async necessaryFilesExist(autoConfirm: boolean, debug = false, checkDist = false) {
        const cwd = process.cwd();
        if (debug) {
            printDebug(`Current full working directory is read as: ${cwd}`);
        }
        const currentDirectorySplit = cwd.split(/[\/\\]/);
        const currentDirectory = currentDirectorySplit[currentDirectorySplit.length - 1];

        if (debug) {
            printDebug(`Current stripped directory is read as: ${currentDirectory}`);
        }

        if (currentDirectory !== NANGO_INTEGRATIONS_NAME) {
            console.log(chalk.red(`You must run this command in the ${NANGO_INTEGRATIONS_NAME} directory.`));
            process.exit(1);
        }

        if (!fs.existsSync(`./${nangoConfigFile}`)) {
            const install = autoConfirm
                ? true
                : await promptly.confirm(`No ${nangoConfigFile} file was found. Would you like to create some default integrations and build them? (yes/no)`);

            if (install) {
                if (debug) {
                    printDebug(`Running init, generate, and tsc to create ${nangoConfigFile} file, generate the integration files and then compile them.`);
                }
                init(debug);
                await generate(debug);
                await compileService.run(debug);
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

        const distDir = './dist';

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
                await generate(debug);
                await compileService.run(debug);
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
                    await compileService.run(debug);
                }
            }
        }
    }

    public async filesMatchConfig(): Promise<boolean> {
        const { success, error, response: config } = await configService.load();

        if (!success || !config) {
            console.log(chalk.red(error?.message));
            throw new Error('Failed to load config');
        }

        const syncNames = config.map((provider) => provider.syncs.map((sync) => sync.name)).flat();
        const actionNames = config.map((provider) => provider.actions.map((action) => action.name)).flat();
        const flows = [...syncNames, ...actionNames].filter((name) => name);

        const tsFiles = glob.sync(`./*.ts`);

        const tsFileNames = tsFiles.filter((file) => !file.includes('models.ts')).map((file) => path.basename(file, '.ts'));

        const missingSyncsAndActions = flows.filter((syncOrActionName) => !tsFileNames.includes(syncOrActionName as string));

        if (missingSyncsAndActions.length > 0) {
            console.log(chalk.red(`The following syncs are missing a corresponding .ts file: ${missingSyncsAndActions.join(', ')}`));
            throw new Error('Syncs missing .ts files');
        }

        const extraSyncs = tsFileNames.filter((syncName) => !flows.includes(syncName));

        if (extraSyncs.length > 0) {
            console.log(chalk.red(`The following .ts files do not have a corresponding sync in the config: ${extraSyncs.join(', ')}`));
            throw new Error('Extra .ts files');
        }

        return true;
    }
}

const verificationService = new VerificationService();
export default verificationService;
