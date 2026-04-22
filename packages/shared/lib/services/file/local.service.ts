import fs from 'fs';
import path from 'path';

import archiver from 'archiver';

import { nangoConfigFile } from '@nangohq/nango-yaml';
import { report } from '@nangohq/utils';

import { localPaths, scriptTypeToPath } from './paths.js';
import { NangoError } from '../../utils/error.js';
import errorManager from '../../utils/error.manager.js';
import { resolveLocalFileName, resolveLocalFilePath } from '../../utils/utils.js';

import type { FileService } from './index.js';
import type { DeploymentCoords, ScriptIdentity, YamlCoords } from './paths.js';
import type { DBSyncConfig } from '@nangohq/types';
import type { Response } from 'express';

class LocalFileService implements FileService {
    public getCompiledJs({ syncConfig, providerConfigKey }: { syncConfig: DBSyncConfig; providerConfigKey: string }): Promise<string | null> {
        return Promise.resolve(this.getIntegrationFile({ syncConfig, providerConfigKey }));
    }

    public async getSourceTs({ syncConfig, providerConfigKey }: { syncConfig: DBSyncConfig; providerConfigKey: string }): Promise<string | null> {
        const tsFilePath = this.resolveTsFile({ scriptName: syncConfig.sync_name, providerConfigKey, syncConfig });
        if (!tsFilePath) return null;
        return await fs.promises.readFile(tsFilePath, 'utf8');
    }

    public async uploadCompiledJs({ content, coords, script }: { content: string; coords: DeploymentCoords; script: ScriptIdentity }): Promise<string> {
        const fileName = resolveLocalFileName({ syncName: script.scriptName, providerConfigKey: coords.providerConfigKey });
        this.putIntegrationFile({ fileName, fileContent: content });
        return Promise.resolve(resolveLocalFilePath({ fileName }));
    }

    public async uploadSourceTs({
        content,
        coords,
        script
    }: {
        content: string;
        coords: DeploymentCoords;
        script: Pick<ScriptIdentity, 'scriptName' | 'scriptType'>;
    }): Promise<string | null> {
        const fileName = localPaths.tsNestedRelative({
            providerConfigKey: coords.providerConfigKey,
            scriptType: script.scriptType,
            scriptName: script.scriptName
        });
        this.putIntegrationFile({ fileName, fileContent: content });
        return Promise.resolve(resolveLocalFilePath({ fileName }));
    }

    public uploadNangoYaml({ content }: { content: string; coords: YamlCoords }): Promise<string> {
        this.putIntegrationFile({ fileName: nangoConfigFile, fileContent: content });
        return Promise.resolve(resolveLocalFilePath({ fileName: nangoConfigFile }));
    }

    public async deleteDeployedFiles(_fileLocations: string[]): Promise<void> {
        // no-op: local mode doesn't track deployed files by S3 key
    }

    /**
     * Zip And Send Files
     * @desc grab the files locally from the integrations path, zip and send
     * the archive
     */
    public async zipAndSendFlow({ res, syncConfig, providerConfigKey }: { res: Response; syncConfig: DBSyncConfig; providerConfigKey: string }) {
        const files: string[] = [];
        if (!syncConfig.sdk_version?.includes('-zero')) {
            const yamlPath = resolveLocalFilePath({ fileName: nangoConfigFile });
            const yamlExists = this.checkForIntegrationSourceFile(nangoConfigFile);
            if (!yamlExists.result) {
                errorManager.errResFromNangoErr(res, new NangoError('integration_file_not_found'));
                return;
            }
            files.push(yamlPath);
        }

        const scriptName = syncConfig.sync_name;

        const jsFilePath = resolveLocalFilePath({ fileName: resolveLocalFileName({ syncName: syncConfig.sync_name, providerConfigKey }) });
        if (!jsFilePath) {
            errorManager.errResFromNangoErr(res, new NangoError('integration_file_not_found'));
            return;
        }
        files.push(jsFilePath);

        const tsFilePath = this.resolveTsFile({ scriptName, providerConfigKey, syncConfig });
        if (!tsFilePath) {
            errorManager.errResFromNangoErr(res, new NangoError('integration_file_not_found'));
            return;
        }
        files.push(tsFilePath);

        const archive = archiver('zip');

        archive.on('error', (err) => {
            report(err);

            errorManager.errResFromNangoErr(res, new NangoError('error_creating_zip_file'));
            return;
        });

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=nango-integrations.zip`);

        archive.pipe(res);

        for (const file of files) {
            archive.append(fs.createReadStream(file), { name: path.basename(file) });
        }

        await archive.finalize();
    }

    public getIntegrationFile({ syncConfig, providerConfigKey }: { syncConfig: DBSyncConfig; providerConfigKey: string }) {
        try {
            const filePath = resolveLocalFilePath({ fileName: resolveLocalFileName({ syncName: syncConfig.sync_name, providerConfigKey }) });
            const integrationFileContents = fs.readFileSync(filePath, 'utf8');
            return integrationFileContents;
        } catch (err) {
            console.log(err);
            return null;
        }
    }

    public putIntegrationFile({ fileName, fileContent }: { fileName: string; fileContent: string }) {
        try {
            const fp = resolveLocalFilePath({ fileName });
            fs.mkdirSync(fp.replace(path.basename(fp), ''), { recursive: true });
            fs.writeFileSync(fp, fileContent, 'utf8');

            return true;
        } catch (err) {
            report(err);
            return false;
        }
    }

    public checkForIntegrationSourceFile(fileName: string) {
        const filePath = resolveLocalFilePath({ fileName });
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

    private resolveTsFile({
        scriptName,
        providerConfigKey,
        syncConfig
    }: {
        scriptName: string;
        providerConfigKey: string;
        syncConfig: DBSyncConfig;
    }): null | string {
        const fileName = `${scriptName}.ts`;
        const nestedFilePath = `${providerConfigKey}/${scriptTypeToPath[syncConfig.type]}/${fileName}`;
        const nestedPath = resolveLocalFilePath({ fileName: nestedFilePath });
        if (this.checkForIntegrationSourceFile(nestedFilePath).result) {
            return nestedPath;
        }

        const tsFilePath = resolveLocalFilePath({ fileName });
        if (!this.checkForIntegrationSourceFile(fileName).result) {
            return null;
        }

        return tsFilePath;
    }
}

export default new LocalFileService();
