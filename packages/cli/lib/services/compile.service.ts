import fs from 'fs';
import * as tsNode from 'ts-node';
import { glob } from 'glob';
import chalk from 'chalk';
import path from 'path';
import { SyncConfigType, localFileService } from '@nangohq/shared';
import type { StandardNangoConfig } from '@nangohq/shared';

import configService from './config.service.js';
import { getNangoRootPath, printDebug } from '../utils.js';
import { TYPES_FILE_NAME } from '../constants.js';
import modelService from './model.service.js';
import parserService from './parser.service.js';

class CompileService {
    public async run({
        debug,
        scriptName,
        providerConfigKey,
        type
    }: {
        debug: boolean;
        scriptName?: string;
        providerConfigKey?: string;
        type?: string;
    }): Promise<boolean> {
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

        const { success: loadSuccess, error, response: config } = await configService.load('', debug);

        if (!loadSuccess || !config) {
            console.log(chalk.red(error?.message));
            throw new Error('Error loading config');
        }

        let scriptDirectory = process.cwd();
        if (scriptName && providerConfigKey && type) {
            scriptDirectory = localFileService.resolveTsFileLocation({ scriptName, providerConfigKey, type });
            console.log(chalk.green(`Compiling ${scriptName}.ts in ${scriptDirectory}`));
        }

        const integrationFiles = listFilesToCompile({ scriptName, cwd: scriptDirectory, config });
        let success = true;

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
                    if (scriptName && file.inputPath.includes(scriptName)) {
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

export function getFileToCompile(filePath: string): ListedFile {
    return {
        inputPath: filePath,
        outputPath: './dist/' + path.basename(filePath, '.ts') + '.js',
        baseName: path.basename(filePath, '.ts')
    };
}

export function listFilesToCompile({
    cwd,
    scriptName,
    config
}: { cwd?: string; scriptName?: string | undefined; config?: StandardNangoConfig[] } = {}): ListedFile[] {
    let files: string[] = [];
    if (scriptName) {
        files = [`${cwd || process.cwd()}/${scriptName}.ts`];
    } else {
        files = glob.sync(`${cwd || process.cwd()}/**/*.ts`);

        if (config) {
            config.forEach((providerConfig) => {
                const syncPath = `${providerConfig.providerConfigKey}/syncs`;
                const actionPath = `${providerConfig.providerConfigKey}/actions`;

                files = [...files, ...glob.sync(`${cwd || process.cwd()}/${syncPath}/**/*.ts`), ...glob.sync(`${cwd || process.cwd()}/${actionPath}/**/*.ts`)];
            });
        }
    }

    return files.map((filePath) => {
        return getFileToCompile(filePath);
    });
}

const compileService = new CompileService();
export default compileService;
