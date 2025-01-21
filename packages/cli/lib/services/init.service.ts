import fs from 'node:fs';
import path from 'node:path';
import { NANGO_INTEGRATIONS_NAME } from '../constants.js';
import chalk from 'chalk';
import { printDebug } from '../utils.js';
import { nangoConfigFile } from '@nangohq/nango-yaml';
import { generate } from '../cli.js';

/**
 * Init
 * If we're not currently in the nango-integrations directory create one
 * and create an example nango.yaml file
 */
export function init({ absolutePath, debug = false }: { absolutePath: string; debug?: boolean }) {
    const yamlData = fs.readFileSync(path.resolve(__dirname, `../templates/${nangoConfigFile}`), 'utf8');
    const envData = fs.readFileSync(path.resolve(__dirname, '../templates/env'), 'utf8');

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
        fs.writeFileSync(envFileLocation, envData);
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
