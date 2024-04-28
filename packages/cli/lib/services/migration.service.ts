import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { exec } from 'child_process';

import { nangoConfigFile, loadLocalNangoConfig, determineVersion } from '@nangohq/shared';
import { getNangoRootPath } from '../utils.js';

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

async function createDirectory(dirPath: string): Promise<void> {
    try {
        await fs.promises.mkdir(dirPath, { recursive: true });
        console.log(chalk.green(`Created directory at ${dirPath}.`));
    } catch (error) {
        console.error(chalk.red(`There was an issue creating the directory at ${dirPath}.`), error);
    }
}

async function moveFile(source: string, destination: string): Promise<void> {
    try {
        await fs.promises.rename(source, destination);
        console.log(chalk.green(`Moved file from ${source} to ${destination}.`));
    } catch (error) {
        console.error(chalk.red(`There was an issue moving the file from ${source} to ${destination}.`), error);
    }
}

async function updateImports(filePath: string): Promise<void> {
    try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        const updatedData = data.replace(/from '\.\//g, "from '../../");
        await fs.promises.writeFile(filePath, updatedData, 'utf8');
        console.log(chalk.green(`Updated imports in ${filePath}.`));
    } catch (error) {
        console.error(chalk.red(`There was an issue updating the imports in ${filePath}.`), error);
    }
}

export const directoryMigration = async (loadLocation: string): Promise<void> => {
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
        await createDirectory(integrationPath);

        const scripts = localConfig.integrations[integration];

        if (scripts?.syncs) {
            const syncsPath: string = path.join(integrationPath, 'syncs');
            await createDirectory(syncsPath);
            for (const sync of Object.keys(scripts.syncs)) {
                const syncPath: string = path.join(syncsPath, `${sync}.ts`);
                await moveFile(path.join(loadLocation, `${sync}.ts`), syncPath);
                await updateImports(syncPath);
            }
        }

        if (scripts?.actions) {
            const actionsPath: string = path.join(integrationPath, 'actions');
            await createDirectory(actionsPath);
            for (const action of Object.keys(scripts.actions)) {
                const actionPath: string = path.join(actionsPath, `${action}.ts`);
                await moveFile(path.join(loadLocation, `${action}.ts`), actionPath);
                await updateImports(actionPath);
            }
        }
    }
};
