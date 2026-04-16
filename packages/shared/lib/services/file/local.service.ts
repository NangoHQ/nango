import fs from 'fs';
import path from 'path';

import archiver from 'archiver';

import { nangoConfigFile } from '@nangohq/nango-yaml';
import { report } from '@nangohq/utils';

import { NangoError } from '../../utils/error.js';
import errorManager from '../../utils/error.manager.js';
import { resolveLocalFileName, resolveLocalFilePath } from '../../utils/utils.js';

import type { DBSyncConfig, NangoProps } from '@nangohq/types';
import type { Response } from 'express';

const scriptTypeToPath: Record<NangoProps['scriptType'], string> = {
    'on-event': 'on-events',
    action: 'actions',
    sync: 'syncs',
    webhook: 'syncs'
};

class LocalFileService {
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
}

export default new LocalFileService();
