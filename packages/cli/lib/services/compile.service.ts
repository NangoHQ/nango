import fs from 'fs';
import * as tsNode from 'ts-node';
import { glob } from 'glob';
import chalk from 'chalk';
import path from 'path';
import { SyncConfigType } from '@nangohq/shared';

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

        const compilerOptions = (JSON.parse(tsconfig) as { compilerOptions: Record<string, any> }).compilerOptions;
        const compiler = tsNode.create({
            skipProject: true, // when installed locally we don't want ts-node to pick up the package tsconfig.json file
            compilerOptions
        });

        if (debug) {
            printDebug(`Compiler options: ${JSON.stringify(compilerOptions, null, 2)}`);
        }

        const integrationFiles = listFiles({ cwd: './', syncName });
        let success = true;

        const { success: loadSuccess, error, response: config } = await configService.load('', debug);

        if (!loadSuccess || !config) {
            console.log(chalk.red(error?.message));
            throw new Error('Error loading config');
        }

        const modelNames = configService.getModelNames(config);

        for (const file of integrationFiles) {
            try {
                const providerConfiguration = config.find((config) => [...config.syncs, ...config.actions].find((sync) => sync.name === file.baseName));

                if (!providerConfiguration) {
                    continue;
                }

                const syncConfig = [...(providerConfiguration?.syncs || []), ...(providerConfiguration?.actions || [])].find(
                    (sync) => sync.name === file.baseName
                );
                const type = syncConfig?.type || SyncConfigType.SYNC;

                if (!parserService.callsAreUsedCorrectly(file.inputPath, type, modelNames)) {
                    if (syncName && file.inputPath.includes(syncName)) {
                        success = false;
                    }
                    continue;
                }
                const result = compiler.compile(fs.readFileSync(file.inputPath, 'utf8'), file.inputPath);

                fs.writeFileSync(file.outputPath, result);
                console.log(chalk.green(`Compiled "${file.inputPath}" successfully`));
            } catch (error) {
                console.error(`Error compiling "${file.inputPath}":`);
                console.error(error);
                success = false;
            }
        }

        return success;
    }
}

export interface ListedFile {
    inputPath: string;
    outputPath: string;
    baseName: string;
}

export function listFile(filePath: string): ListedFile {
    if (!filePath.startsWith('./')) {
        filePath = `./${filePath}`;
    }
    return {
        inputPath: filePath,
        outputPath: filePath.replace(/\/[^/]*$/, `/dist/${path.basename(filePath.replace('.ts', '.js'))}`),
        baseName: path.basename(filePath, '.ts')
    };
}
export function listFiles({ cwd, syncName }: { cwd?: string; syncName?: string | undefined }): ListedFile[] {
    const files = syncName ? [`./${syncName}.ts`] : glob.sync(`./*.ts`, { dotRelative: true, cwd: cwd || process.cwd() });

    return files.map((filePath) => {
        return listFile(filePath);
    });
}

const compileService = new CompileService();
export default compileService;
