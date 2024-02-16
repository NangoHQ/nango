import type { Response } from 'express';
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';
import { NangoError } from '../../utils/error.js';
import { LogActionEnum } from '../../models/Activity.js';
import { nangoConfigFile, SYNC_FILE_EXTENSION } from '../nango-config.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class LocalFileService {
    public getIntegrationFile(syncName: string, setIntegrationPath?: string | null) {
        try {
            const filePath = setIntegrationPath ? `${setIntegrationPath}/dist/${syncName}.${SYNC_FILE_EXTENSION}` : this.resolveIntegrationFile(syncName);
            const realPath = fs.realpathSync(filePath);
            const integrationFileContents = fs.readFileSync(realPath, 'utf8');

            return integrationFileContents;
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    public putIntegrationFile(syncName: string, fileContents: string, distPrefix: boolean) {
        try {
            const realPath = fs.realpathSync(process.env['NANGO_INTEGRATIONS_FULL_PATH'] as string);
            if (!fs.existsSync(`${realPath}${distPrefix ? '/dist' : ''}/${syncName}`)) {
                if (distPrefix) {
                    fs.mkdirSync(`${realPath}/dist`, { recursive: true });
                }
                fs.writeFileSync(`${realPath}${distPrefix ? '/dist' : ''}/${syncName}`, fileContents, 'utf8');
            }

            return true;
        } catch (error) {
            console.log(error);
            return false;
        }
    }

    public checkForIntegrationDistFile(syncName: string, optionalNangoIntegrationsDirPath?: string) {
        let nangoIntegrationsDirPath = '';

        if (optionalNangoIntegrationsDirPath) {
            nangoIntegrationsDirPath = optionalNangoIntegrationsDirPath;
        } else {
            nangoIntegrationsDirPath = process.env['NANGO_INTEGRATIONS_FULL_PATH'] as string;
        }

        const distDirPath = path.resolve(nangoIntegrationsDirPath, 'dist');

        if (!fs.existsSync(nangoIntegrationsDirPath)) {
            return {
                result: false,
                path: nangoIntegrationsDirPath
            };
        }

        if (!fs.existsSync(distDirPath)) {
            return {
                result: false,
                path: distDirPath
            };
        }

        const filePath = path.resolve(distDirPath, `${syncName}.${SYNC_FILE_EXTENSION}`);
        let realPath;
        try {
            realPath = fs.realpathSync(filePath);
        } catch (err) {
            realPath = filePath;
        }

        return {
            result: fs.existsSync(realPath),
            path: realPath
        };
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
        } catch (err) {
            realPath = filePath;
        }

        return {
            result: fs.existsSync(realPath),
            path: realPath
        };
    }

    public async getIntegrationClass(syncName: string, setIntegrationPath?: string) {
        try {
            const filePath = setIntegrationPath || this.resolveIntegrationFile(syncName);
            const realPath = fs.realpathSync(filePath) + `?v=${Math.random().toString(36).substring(3)}`;
            const { default: integrationCode } = await import(realPath);
            const integrationClass = new integrationCode();

            return integrationClass;
        } catch (error) {
            console.error(error);
        }

        return null;
    }

    public getIntegrationTsFile(syncName: string, setIntegrationPath?: string | null) {
        try {
            const filePath = setIntegrationPath ? `${setIntegrationPath}/${syncName}.ts` : this.resolveIntegrationFile(syncName);
            const realPath = fs.realpathSync(filePath);
            const tsIntegrationFileContents = fs.readFileSync(realPath, 'utf8');

            return tsIntegrationFileContents;
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    public getNangoYamlFileContents(setIntegrationPath?: string | null) {
        try {
            const filePath = setIntegrationPath
                ? `${setIntegrationPath}/${nangoConfigFile}`
                : path.resolve(__dirname, `../nango-integrations/${nangoConfigFile}`);
            const realPath = fs.realpathSync(filePath);
            const nangoYamlFileContents = fs.readFileSync(realPath, 'utf8');

            return nangoYamlFileContents;
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    /**
     * Zip And Send Files
     * @desc grab the files locally from the integrations path, zip and send
     * the archive
     */
    public async zipAndSendFiles(res: Response, integrationName: string, accountId: number, environmentId: number, nangoConfigId: number) {
        const integrationPath = process.env['NANGO_INTEGRATIONS_FULL_PATH'] as string;

        const tsFilePath = path.resolve(integrationPath, `${integrationName}.ts`);
        const nangoConfigFilePath = path.resolve(integrationPath, nangoConfigFile);

        const tsFileExists = this.checkForIntegrationSourceFile(`${integrationName}.ts`, integrationPath);
        const nangoConfigFileExists = this.checkForIntegrationSourceFile(nangoConfigFile, integrationPath);

        if (!tsFileExists.result || !nangoConfigFileExists.result) {
            errorManager.errResFromNangoErr(res, new NangoError('integration_file_not_found'));
            return;
        }

        const archive = archiver('zip');

        archive.on('error', async (err) => {
            await errorManager.report(err, {
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

    private resolveIntegrationFile(syncName: string): string {
        if (process.env['NANGO_INTEGRATIONS_FULL_PATH']) {
            return path.resolve(process.env['NANGO_INTEGRATIONS_FULL_PATH'], `dist/${syncName}.${SYNC_FILE_EXTENSION}`);
        } else {
            return path.resolve(__dirname, `../nango-integrations/dist/${syncName}.${SYNC_FILE_EXTENSION}`);
        }
    }
}

export default new LocalFileService();
