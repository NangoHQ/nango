import type { Response } from 'express';
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
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

    public checkForIntegrationFile(syncName: string, optionalNangoIntegrationsDirPath?: string) {
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

    public zipAndSendFiles(res: Response, integrationName: string, accountId: number, environmentId: number, nangoConfigId: number) {
        // TODO
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
