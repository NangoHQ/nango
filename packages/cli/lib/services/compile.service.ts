import fs from 'fs';
import * as tsNode from 'ts-node';
import glob from 'glob';
import chalk from 'chalk';
import path from 'path';
import { SyncConfigType, NangoSyncConfig } from '@nangohq/shared';

import configService from './config.service.js';
import { getNangoRootPath, printDebug } from '../utils.js';
import { TYPES_FILE_NAME } from '../constants.js';
import modelService from './model.service.js';
import parserService from './parser.service.js';

class CompileService {
    public async run(debug = false, syncName?: string): Promise<boolean> {
        const tsconfig = fs.readFileSync(`${getNangoRootPath()}/tsconfig.dev.json`, 'utf8');

        const distDir = './dist';
        if (!fs.existsSync(distDir)) {
            if (debug) {
                printDebug(`Creating ${distDir} directory`);
            }
            fs.mkdirSync(distDir);
        }

        if (!fs.existsSync(`./${TYPES_FILE_NAME}`)) {
            if (debug) {
                printDebug(`Creating ${TYPES_FILE_NAME} file`);
            }
            await modelService.createModelFile();
        }

        const compiler = tsNode.create({
            compilerOptions: JSON.parse(tsconfig).compilerOptions
        });

        if (debug) {
            printDebug(`Compiler options: ${JSON.stringify(JSON.parse(tsconfig).compilerOptions, null, 2)}`);
        }

        const integrationFiles = syncName ? [`./${syncName}.ts`] : glob.sync(`./*.ts`);
        let success = true;

        const { success: loadSuccess, error, response: config } = await configService.load('', debug);

        if (!loadSuccess || !config) {
            console.log(chalk.red(error?.message));
            throw new Error('Error loading config');
        }

        const modelNames = configService.getModelNames(config);

        for (const filePath of integrationFiles) {
            try {
                const providerConfiguration = config.find((config) =>
                    [...config.syncs, ...config.actions].find((sync) => sync.name === path.basename(filePath, '.ts'))
                );

                if (!providerConfiguration) {
                    continue;
                }

                const syncConfig = [...(providerConfiguration?.syncs as NangoSyncConfig[]), ...(providerConfiguration?.actions as NangoSyncConfig[])].find(
                    (sync) => sync.name === path.basename(filePath, '.ts')
                );
                const type = syncConfig?.type || SyncConfigType.SYNC;

                if (!parserService.callsAreUsedCorrectly(filePath, type, modelNames)) {
                    if (syncName && filePath.includes(syncName)) {
                        success = false;
                    }
                    continue;
                }
                const result = compiler.compile(fs.readFileSync(filePath, 'utf8'), filePath);
                const jsFilePath = filePath.replace(/\/[^\/]*$/, `/dist/${path.basename(filePath.replace('.ts', '.js'))}`);

                fs.writeFileSync(jsFilePath, result);
                console.log(chalk.green(`Compiled "${filePath}" successfully`));
            } catch (error) {
                console.error(`Error compiling "${filePath}":`);
                console.error(error);
                success = false;
            }
        }

        return success;
    }
}

const compileService = new CompileService();
export default compileService;
