import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import archiver from 'archiver';

import { nangoConfigFile } from '@nangohq/nango-yaml';
import { report } from '@nangohq/utils';

import { LogActionEnum } from '../../models/Telemetry.js';
import { NangoError } from '../../utils/error.js';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';

import type { DBSyncConfig, NangoProps } from '@nangohq/types';
import type { Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scriptTypeToPath: Record<NangoProps['scriptType'], string> = {
    'on-event': 'on-events',
    action: 'actions',
    sync: 'syncs',
    webhook: 'syncs'
};

const basePath = process.env['NANGO_INTEGRATIONS_FULL_PATH'] || path.resolve(__dirname, `../nango-integrations`);

class LocalFileService {
    public getIntegrationFile({
        scriptType,
        syncConfig,
        providerConfigKey
    }: {
        scriptType: NangoProps['scriptType'];
        syncConfig: DBSyncConfig;
        providerConfigKey: string;
    }) {
        try {
            const filePath = this.resolveIntegrationFile({ scriptType, syncConfig, providerConfigKey });
            const integrationFileContents = fs.readFileSync(filePath, 'utf8');
            return integrationFileContents;
        } catch (err) {
            console.log(err);
            return null;
        }
    }

    public putIntegrationFile({ filePath, fileContent }: { filePath: string; fileContent: string }) {
        try {
            const fp = path.join(basePath, filePath);
            fs.mkdirSync(fp.replace(path.basename(fp), ''), { recursive: true });
            fs.writeFileSync(fp, fileContent, 'utf8');

            return true;
        } catch (err) {
            report(err);
            return false;
        }
    }

    public checkForIntegrationSourceFile(fileName: string, optionalNangoIntegrationsDirPath?: string) {
        let nangoIntegrationsDirPath = '';

        if (optionalNangoIntegrationsDirPath) {
            nangoIntegrationsDirPath = optionalNangoIntegrationsDirPath;
        } else {
            nangoIntegrationsDirPath = basePath;
        }

        const filePath = path.resolve(nangoIntegrationsDirPath, fileName);
        let realPath;
        try {
            realPath = fs.realpathSync(filePath);
        } catch {
            realPath = filePath;
        }

        return {
            result: fs.existsSync(realPath),
            path: realPath
        };
    }

    private getFullPathTsFile(scriptName: string, providerConfigKey: string, type: NangoProps['scriptType']): null | string {
        const nestedFilePath = `${providerConfigKey}/${scriptTypeToPath[type]}/${scriptName}.ts`;
        const nestedPath = path.resolve(basePath, nestedFilePath);
        if (this.checkForIntegrationSourceFile(nestedFilePath).result) {
            return nestedPath;
        }

        const tsFilePath = path.resolve(basePath, `${scriptName}.ts`);
        if (!this.checkForIntegrationSourceFile(`${scriptName}.ts`).result) {
            return null;
        }

        return tsFilePath;
    }

    /**
     * Zip And Send Files
     * @desc grab the files locally from the integrations path, zip and send
     * the archive
     */
    public async zipAndSendFiles(
        res: Response,
        integrationName: string,
        accountId: number,
        environmentId: number,
        nangoConfigId: number,
        providerConfigKey: string,
        flowType: string
    ) {
        const nangoConfigFilePath = path.resolve(basePath, nangoConfigFile);
        const nangoConfigFileExists = this.checkForIntegrationSourceFile(nangoConfigFile);

        const tsFilePath = this.getFullPathTsFile(integrationName, providerConfigKey, flowType as NangoProps['scriptType']);

        if (!tsFilePath || !nangoConfigFileExists.result) {
            errorManager.errResFromNangoErr(res, new NangoError('integration_file_not_found'));
            return;
        }

        const archive = archiver('zip');

        archive.on('error', (err) => {
            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                environmentId,
                operation: LogActionEnum.FILE,
                metadata: {
                    integrationName,
                    accountId,
                    nangoConfigId
                }
            });

            errorManager.errResFromNangoErr(res, new NangoError('error_creating_zip_file'));
            return;
        });

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=nango-integrations.zip`);

        archive.pipe(res);

        archive.append(fs.createReadStream(nangoConfigFilePath), { name: nangoConfigFile });
        archive.append(fs.createReadStream(tsFilePath), { name: `${integrationName}.ts` });

        await archive.finalize();
    }

    private resolveIntegrationFile({
        scriptType,
        syncConfig,
        providerConfigKey
    }: {
        scriptType: NangoProps['scriptType'];
        syncConfig: DBSyncConfig;
        providerConfigKey: string;
    }): string {
        if (syncConfig.sdk_version && syncConfig.sdk_version.includes('zero')) {
            return path.resolve(basePath, `build/${providerConfigKey}_${scriptTypeToPath[scriptType]}_${syncConfig.sync_name}.cjs`);
        } else {
            return path.resolve(basePath, `dist/${syncConfig.sync_name}-${providerConfigKey}.js`);
        }
    }
}

export default new LocalFileService();
