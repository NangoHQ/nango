import fs, { writeFileSync } from 'fs';
import path from 'path';
import chalk from 'chalk';
import { exec } from 'child_process';

import { nangoConfigFile } from '@nangohq/nango-yaml';
import { printDebug, getNangoRootPath } from '../utils.js';
import { parse } from './config.service.js';

export const v1toV2Migration = (loadLocation: string): void => {
    if (process.env['NANGO_CLI_UPGRADE_MODE'] === 'ignore') {
        return;
    }

    const parsing = parse(loadLocation);
    if (parsing.isErr()) {
        return;
    }

    if (parsing.value.parsed!.yamlVersion === 'v2') {
        console.log(chalk.blue(`nango.yaml is already at v2.`));
        return;
    }

    const scriptFile = path.join(getNangoRootPath(), 'scripts/v1-v2.js');
    exec(`node ${scriptFile} ./${nangoConfigFile}`, (error) => {
        if (error) {
            console.log(chalk.red(`There was an issue migrating your nango.yaml to v2.`));
            console.error(error);
            return;
        }
        console.log(chalk.blue(`Migrated to v2 of nango.yaml!`));
    });
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
        const updatedData = data.replace(/\.\/models/g, '../../models');
        await fs.promises.writeFile(filePath, updatedData, 'utf8');
        if (debug) {
            printDebug(`Updated imports in ${filePath}.`);
        }
    } catch (err) {
        console.error(chalk.red(`There was an issue updating the imports in ${filePath}.`), err);
    }
}

export const directoryMigration = async (loadLocation: string, debug?: boolean): Promise<void> => {
    const parsing = parse(loadLocation);
    if (parsing.isErr()) {
        return;
    }

    if (parsing.value.parsed!.yamlVersion !== 'v2') {
        console.log(chalk.red(`nango.yaml is not at v2. Nested directories are not supported in v1.`));
        return;
    }

    for (const integration of parsing.value.parsed!.integrations) {
        const integrationPath = path.join(loadLocation, integration.providerConfigKey);
        await createDirectory(integrationPath, debug);

        if (integration.syncs) {
            const syncsPath: string = path.join(integrationPath, 'syncs');
            await createDirectory(syncsPath, debug);
            for (const sync of integration.syncs) {
                const syncPath: string = path.join(syncsPath, `${sync.name}.ts`);
                const moved = await moveFile(path.join(loadLocation, `${sync.name}.ts`), syncPath, debug);
                if (moved) {
                    await updateModelImport(syncPath, debug);
                }
            }
        }

        if (integration.actions) {
            const actionsPath: string = path.join(integrationPath, 'actions');
            await createDirectory(actionsPath, debug);
            for (const action of integration.actions) {
                const actionPath: string = path.join(actionsPath, `${action.name}.ts`);
                const moved = await moveFile(path.join(loadLocation, `${action.name}.ts`), actionPath, debug);
                if (moved) {
                    await updateModelImport(actionPath, debug);
                }
            }
        }
    }

    console.log(chalk.green(`Migration to nested directories complete.`));
};

export function endpointMigration(loadLocation: string): void {
    const parsing = parse(loadLocation);
    if (parsing.isErr()) {
        return;
    }

    if (parsing.value.parsed!.yamlVersion !== 'v2') {
        console.log(chalk.red(`nango.yaml is not at v2. New endpoint format is only supported in V2`));
        return;
    }

    let dump = parsing.value.yaml.replace(
        /^(\s+)endpoint: ((GET|POST|PUT|PATCH|DELETE)\s)?(\/[a-zA-Z0-9-:{}./_]+)$/gim,
        `$1endpoint:\r\n$1  method: $3\r\n$1  path: $4`
    );
    dump = dump.replace(/^(\s+)- ((GET|POST|PUT|PATCH|DELETE)\s)?(\/[a-zA-Z0-9-:{}./_]+)$/gim, `$1- method: $3\r\n$1  path: $4`);

    writeFileSync(`${loadLocation}/nango.yaml`, dump);
    console.log(chalk.green(`Migration complete.`));
}
