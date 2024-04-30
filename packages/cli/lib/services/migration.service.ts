import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { exec } from 'child_process';

import { nangoConfigFile, loadLocalNangoConfig, determineVersion } from '@nangohq/shared';
import { printDebug, getNangoRootPath } from '../utils.js';

export const v1toV2Migration = async (loadLocation: string): Promise<void> => {
    if (process.env['NANGO_CLI_UPGRADE_MODE'] === 'ignore') {
        return;
    }
    const localConfig = await loadLocalNangoConfig(loadLocation);

    if (!localConfig) {
        return;
    }

    const version = determineVersion(localConfig);
    if (version === 'v2') {
        console.log(chalk.blue(`nango.yaml is already at v2.`));
    }
    if (version === 'v1' && localConfig.integrations) {
        exec(`node ${getNangoRootPath()}/scripts/v1-v2.js ./${nangoConfigFile}`, (error) => {
            if (error) {
                console.log(chalk.red(`There was an issue migrating your nango.yaml to v2.`));
                console.error(error);
                return;
            }
            console.log(chalk.blue(`Migrated to v2 of nango.yaml!`));
        });
    }
};

async function createDirectory(dirPath: string, debug = false): Promise<void> {
    if (fs.existsSync(dirPath)) {
        if (debug) {
            printDebug(`Directory already exists at ${dirPath}.`);
        }
        return;
    }

    await fs.promises.mkdir(dirPath, { recursive: true });
    if (debug) {
        printDebug(`Created directory at ${dirPath}.`);
    }
}

async function moveFile(source: string, destination: string, debug = false): Promise<boolean> {
    if (fs.existsSync(destination)) {
        if (debug) {
            printDebug(`File already exists at ${destination}.`);
        }
        return false;
    }

    await fs.promises.rename(source, destination);
    if (debug) {
        printDebug(`Moved file from ${source} to ${destination}.`);
    }

    return true;
}

async function updateModelImport(filePath: string, debug = false): Promise<void> {
    try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        const updatedData = data.replace(/from (["'])\.\/models/g, 'from $1../../models');
        await fs.promises.writeFile(filePath, updatedData, 'utf8');
        if (debug) {
            printDebug(`Updated imports in ${filePath}.`);
        }
    } catch (error) {
        console.error(chalk.red(`There was an issue updating the imports in ${filePath}.`), error);
    }
}

export const directoryMigration = async (loadLocation: string, debug?: boolean): Promise<void> => {
    const localConfig = await loadLocalNangoConfig(loadLocation);

    if (!localConfig) {
        return;
    }

    const version = determineVersion(localConfig);

    if (version !== 'v2') {
        console.log(chalk.red(`nango.yaml is not at v2. Nested directories are not supported in v1.`));
        return;
    }

    for (const integration of Object.keys(localConfig.integrations)) {
        const integrationPath = `${loadLocation}/${integration}`;
        await createDirectory(integrationPath, debug);

        const scripts = localConfig.integrations[integration];

        if (scripts?.syncs) {
            const syncsPath: string = path.join(integrationPath, 'syncs');
            await createDirectory(syncsPath, debug);
            for (const sync of Object.keys(scripts.syncs)) {
                const syncPath: string = path.join(syncsPath, `${sync}.ts`);
                const moved = await moveFile(path.join(loadLocation, `${sync}.ts`), syncPath, debug);
                if (moved) {
                    await updateModelImport(syncPath, debug);
                }
            }
        }

        if (scripts?.actions) {
            const actionsPath: string = path.join(integrationPath, 'actions');
            await createDirectory(actionsPath, debug);
            for (const action of Object.keys(scripts.actions)) {
                const actionPath: string = path.join(actionsPath, `${action}.ts`);
                const moved = await moveFile(path.join(loadLocation, `${action}.ts`), actionPath, debug);
                if (moved) {
                    await updateModelImport(actionPath, debug);
                }
            }
        }
    }

    console.log(chalk.green(`Migration to nested directories complete.`));
};
