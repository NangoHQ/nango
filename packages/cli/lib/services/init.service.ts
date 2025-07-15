import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import chalk from 'chalk';

import { nangoConfigFile } from '@nangohq/nango-yaml';

import { printDebug } from '../utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Init
 * If we're not currently in the nango-integrations directory create one
 * and create an example nango.yaml file
 */
export function init({ absolutePath, debug = false }: { absolutePath: string; debug?: boolean }): boolean {
    const yamlData = fs.readFileSync(path.resolve(__dirname, `../templates/${nangoConfigFile}`), 'utf8');

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

    const gitkeepPath = path.resolve(absolutePath, '.nango/.gitkeep');
    if (!fs.existsSync(gitkeepPath)) {
        if (debug) {
            printDebug(`Creating the .gitkeep file at ${gitkeepPath}`);
        }
        fs.writeFileSync(gitkeepPath, '');
    } else {
        if (debug) {
            printDebug(`.gitkeep file already exists at ${gitkeepPath} so not creating a new one`);
        }
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
        fs.writeFileSync(
            envPath,
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
            printDebug(`.env file already exists at ${envPath} so not creating a new one`);
        }
    }

    const gitIgnorePath = path.resolve(absolutePath, '.gitignore');
    if (!fs.existsSync(gitIgnorePath)) {
        if (debug) {
            printDebug(`Creating the .gitignore file at ${gitIgnorePath}`);
        }
        fs.writeFileSync(
            gitIgnorePath,
            `dist
.env
`
        );
    } else {
        if (debug) {
            printDebug(`.gitignore file already exists at ${gitIgnorePath} so not creating a new one`);
        }
    }

    return true;
}
