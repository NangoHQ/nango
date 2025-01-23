import type { Response } from 'express';
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';
import { NangoError } from '../../utils/error.js';
import { LogActionEnum } from '../../models/Telemetry.js';
import { nangoConfigFile } from '@nangohq/nango-yaml';
import type { NangoProps } from '@nangohq/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SYNC_FILE_EXTENSION = 'cjs';

const scriptTypeToReal: Record<NangoProps['scriptType'], string> = {
    'on-event': 'on-events',
    action: 'actions',
    sync: 'syncs',
    webhook: 'syncs'
};
class LocalFileService {
    public getIntegrationFile({
        syncName,
        scriptType,
        providerConfigKey
    }: {
        syncName: string;
        providerConfigKey: string;
        scriptType: NangoProps['scriptType'];
    }) {
        try {
            const filePath = process.env['NANGO_INTEGRATIONS_FULL_PATH']
                ? path.resolve(
                      process.env['NANGO_INTEGRATIONS_FULL_PATH'],
                      `dist/${providerConfigKey}/${scriptTypeToReal[scriptType]}/${syncName}.${SYNC_FILE_EXTENSION}`
                  )
                : path.resolve(__dirname, `../nango-integrations/dist/${providerConfigKey}/${scriptTypeToReal[scriptType]}/${syncName}.${SYNC_FILE_EXTENSION}`);

            console.log('Loading local file', filePath);
            const integrationFileContents = fs.readFileSync(filePath, 'utf8');

            return integrationFileContents;
        } catch (err) {
            console.log(err);
            return null;
        }
    }

    public putIntegrationFile(syncName: string, fileContents: string, distPrefix: boolean) {
        try {
            const realPath = fs.realpathSync(process.env['NANGO_INTEGRATIONS_FULL_PATH'] as string);
            if (distPrefix) {
                fs.mkdirSync(`${realPath}/dist`, { recursive: true });
            }
            fs.writeFileSync(`${realPath}${distPrefix ? '/dist' : ''}/${syncName}`, fileContents, 'utf8');

            return true;
        } catch (err) {
            console.log(err);
            return false;
        }
    }

    public checkForIntegrationSourceFile(fileName: string, optionalNangoIntegrationsDirPath?: string) {
        let nangoIntegrationsDirPath = '';

        if (optionalNangoIntegrationsDirPath) {
            nangoIntegrationsDirPath = optionalNangoIntegrationsDirPath;
        } else {
            nangoIntegrationsDirPath = process.env['NANGO_INTEGRATIONS_FULL_PATH'] as string;
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

    private getFullPathTsFile(integrationPath: string, scriptName: string, providerConfigKey: string, type: string): null | string {
        const nestedFilePath = `${providerConfigKey}/${type}s/${scriptName}.ts`;
        const nestedPath = path.resolve(integrationPath, nestedFilePath);

        if (this.checkForIntegrationSourceFile(nestedFilePath, integrationPath).result) {
            return nestedPath;
        }
        const tsFilePath = path.resolve(integrationPath, `${scriptName}.ts`);
        if (!this.checkForIntegrationSourceFile(`${scriptName}.ts`, integrationPath).result) {
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
        const integrationPath = process.env['NANGO_INTEGRATIONS_FULL_PATH'] as string;

        const nangoConfigFilePath = path.resolve(integrationPath, nangoConfigFile);
        const nangoConfigFileExists = this.checkForIntegrationSourceFile(nangoConfigFile, integrationPath);

        const tsFilePath = this.getFullPathTsFile(integrationPath, integrationName, providerConfigKey, flowType);

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
}

export default new LocalFileService();
