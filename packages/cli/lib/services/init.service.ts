import fs from 'node:fs';
import path, { dirname } from 'node:path';
import chalk from 'chalk';
import { printDebug } from '../utils.js';
import { nangoConfigFile } from '@nangohq/nango-yaml';
import { generate } from '../cli.js';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Init
 * If we're not currently in the nango-integrations directory create one
 * and create an example nango.yaml file
 */
export function init({ absolutePath, debug = false }: { absolutePath: string; debug?: boolean }): boolean {
    const yamlData = fs.readFileSync(path.resolve(__dirname, `../templates/${nangoConfigFile}`), 'utf8');
    const envData = fs.readFileSync(path.resolve(__dirname, '../templates/env'), 'utf8');
    const gitIgnoreData = fs.readFileSync(path.resolve(__dirname, '../templates/gitignore'), 'utf8');

    const stat = fs.statSync(absolutePath, { throwIfNoEntry: false });
    if (!stat) {
        if (debug) {
            printDebug(`Creating the nango integrations directory at ${absolutePath}`);
        }
        fs.mkdirSync(absolutePath);
    } else if (!stat.isDirectory()) {
        console.log(chalk.red(`The path provided is not a directory. Exiting.`));
        return false;
    }

    const dotNangoPath = path.resolve(absolutePath, '.nango');
    const dotNangoStat = fs.statSync(dotNangoPath, { throwIfNoEntry: false });

    if (!dotNangoStat) {
        if (debug) {
            printDebug(`Creating the .nango directory at ${dotNangoPath}`);
        }
        fs.mkdirSync(dotNangoPath);
    } else if (!dotNangoStat.isDirectory()) {
        console.log(chalk.red(`.nango exists but is not a directory. Exiting.`));
        return false;
    } else {
        console.log(chalk.red(`.nango directory already exists. Exiting.`));
        return false;
    }

    const yamlPath = path.resolve(absolutePath, nangoConfigFile);
    if (!fs.existsSync(yamlPath)) {
        if (debug) {
            printDebug(`Creating the ${nangoConfigFile} file at ${yamlPath}`);
        }
        fs.writeFileSync(yamlPath, yamlData);
    } else {
        if (debug) {
            printDebug(`Nango config file already exists at ${yamlPath} so not creating a new one`);
        }
    }

    const envPath = path.resolve(absolutePath, '.env');
    if (!fs.existsSync(envPath)) {
        if (debug) {
            printDebug(`Creating the .env file at ${envPath}`);
        }
        fs.writeFileSync(envPath, envData);
    } else {
        if (debug) {
            printDebug(`.env file already exists at ${envPath} so not creating a new one`);
        }
    }

    const gitIgnorePath = path.resolve(absolutePath, '.gitignore');
    if (!fs.existsSync(gitIgnorePath)) {
        if (debug) {
            printDebug(`Creating the .gitignore file at ${gitIgnorePath}`);
        }
        fs.writeFileSync(gitIgnorePath, gitIgnoreData);
    } else {
        if (debug) {
            printDebug(`.gitignore file already exists at ${gitIgnorePath} so not creating a new one`);
        }
    }

    generate({ debug, fullPath: absolutePath });
    return true;
}
