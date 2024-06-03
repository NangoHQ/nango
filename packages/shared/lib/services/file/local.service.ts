import type { Response } from 'express';
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';
import { NangoError } from '../../utils/error.js';
import { LogActionEnum } from '../../models/Activity.js';
import type { StandardNangoConfig, LayoutMode } from '../../models/NangoConfig.js';
import { nangoConfigFile, SYNC_FILE_EXTENSION } from '../nango-config.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class LocalFileService {
    public getIntegrationFile(syncName: string, providerConfigKey: string, setIntegrationPath?: string | null) {
        try {
            const filePath = setIntegrationPath ? `${setIntegrationPath}dist/${syncName}.${SYNC_FILE_EXTENSION}` : this.resolveIntegrationFile(syncName);
            const fileNameWithProviderConfigKey = filePath.replace(`.${SYNC_FILE_EXTENSION}`, `-${providerConfigKey}.${SYNC_FILE_EXTENSION}`);

            let realPath;
            if (fs.existsSync(fileNameWithProviderConfigKey)) {
                realPath = fs.realpathSync(fileNameWithProviderConfigKey);
            } else {
                realPath = fs.realpathSync(filePath);
            }
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

    public checkForIntegrationDistFile(syncName: string, providerConfigKey: string, optionalNangoIntegrationsDirPath?: string) {
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

        let filePath = path.resolve(distDirPath, `${syncName}.${SYNC_FILE_EXTENSION}`);
        let realPath;

        const fileNameWithProviderConfigKey = filePath.replace(`.${SYNC_FILE_EXTENSION}`, `-${providerConfigKey}.${SYNC_FILE_EXTENSION}`);

        if (fs.existsSync(fileNameWithProviderConfigKey)) {
            filePath = fileNameWithProviderConfigKey;
        }
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

    public resolveTsFileLocation({ scriptName, providerConfigKey, type }: { scriptName: string; providerConfigKey: string; type: string }) {
        const nestedPath = path.resolve(`./${providerConfigKey}/${type}s/${scriptName}.ts`);
        if (fs.existsSync(nestedPath)) {
            return fs.realpathSync(path.resolve(nestedPath, '../'));
        }

        return fs.realpathSync('./');
    }

    public getIntegrationTsFile(scriptName: string, providerConfigKey: string, type: string) {
        try {
            const realPath = this.resolveTsFileLocation({ scriptName, providerConfigKey, type });
            const tsIntegrationFileContents = fs.readFileSync(`${realPath}/${scriptName}.ts`, 'utf8');

            return tsIntegrationFileContents;
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    /*
     * Get Layout Mode
     * @desc determine if the layout mode is nested or root
     * 1. If the file exists in the root directory already then it is 'root'
     * 2. If the file exists in the nested path then it is 'nested'
     * 3. If an existing directory is found for that provider already then it is 'nested'
     * 4. If there are no files in the root directory at all then it should be
     * 'nested' since that is the new default
     * 5. If we're initializing then we should default to nested
     * 6. Falback to nested
     */
    public getLayoutMode(scriptName: string, providerConfigKey: string, type: string): LayoutMode {
        if (fs.existsSync(`./${scriptName}.ts`)) {
            return 'root';
        }

        const nestedPath = path.resolve(`./${providerConfigKey}/${type}s/${scriptName}.ts`);
        if (fs.existsSync(nestedPath)) {
            return 'nested';
        }

        const nestedProvider = path.resolve(`./${providerConfigKey}`);
        if (fs.existsSync(nestedProvider)) {
            return 'nested';
        }

        const rootPath = fs.realpathSync('./');
        const files = fs.readdirSync(rootPath);
        if (files.length === 0) {
            return 'nested';
        }

        if (files.includes('nango-integrations')) {
            const nangoIntegrationsPath = path.resolve(rootPath, 'nango-integrations');
            const nangoFiles = fs.readdirSync(nangoIntegrationsPath);
            const expected = ['.env', 'models.ts', 'nango.yaml'];
            if (nangoFiles.length === 3 && expected.every((file) => nangoFiles.includes(file))) {
                return 'nested';
            }
        }

        return 'nested';
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

    public getProviderConfigurationFromPath(filePath: string, config: StandardNangoConfig[]): StandardNangoConfig | null {
        const pathSegments = filePath.split('/');
        const scriptType = pathSegments.length > 1 ? pathSegments[pathSegments.length - 2] : null;
        const isNested = scriptType === 'syncs' || scriptType === 'actions' || scriptType === 'post-connection-scripts';

        const baseName = path.basename(filePath, '.ts');
        let providerConfiguration: StandardNangoConfig | null = null;
        if (isNested) {
            const providerConfigKey = pathSegments[pathSegments.length - 3];
            providerConfiguration = config.find((config) => config.providerConfigKey === providerConfigKey) || null;
        } else {
            providerConfiguration = config.find((config) => [...config.syncs, ...config.actions].find((sync) => sync.name === baseName)) || null;
        }

        return providerConfiguration;
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

        archive.on('error', async (err) => {
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

    private resolveIntegrationFile(syncName: string): string {
        if (process.env['NANGO_INTEGRATIONS_FULL_PATH']) {
            return path.resolve(process.env['NANGO_INTEGRATIONS_FULL_PATH'], `dist/${syncName}.${SYNC_FILE_EXTENSION}`);
        } else {
            return path.resolve(__dirname, `../nango-integrations/dist/${syncName}.${SYNC_FILE_EXTENSION}`);
        }
    }
}

export default new LocalFileService();
