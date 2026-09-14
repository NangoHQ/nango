import archiver from 'archiver';

import { nangoConfigFile } from '@nangohq/nango-yaml';
import { isCloud, isEnterprise, isLocal, isTest, report, useRemoteStorage } from '@nangohq/utils';

import { NangoError } from '../../utils/error.js';
import errorManager from '../../utils/error.manager.js';
import localFileService from './local.service.js';
import { createObjectStore, resolveObjectStoreConfig } from './storage/index.js';

import type { ServiceResponse } from '../../models/Generic.js';
import type { ObjectStore } from './storage/index.js';
import type { DBSyncConfig } from '@nangohq/types';
import type { Response } from 'express';
import type { Readable } from 'node:stream';

class RemoteFileService {
    private store: ObjectStore | undefined;
    private useRemote: boolean;

    publicRoute = 'integration-templates';
    publicZeroYamlRoute = 'templates-zero';

    constructor() {
        if (isEnterprise) {
            this.useRemote = useRemoteStorage;
        } else {
            this.useRemote = !isLocal && !isTest;
        }
        if (this.useRemote) {
            this.store = createObjectStore(resolveObjectStoreConfig(process.env));
        }
    }

    private getStore(): ObjectStore {
        this.store ??= createObjectStore(resolveObjectStoreConfig(process.env));
        return this.store;
    }

    async upload({
        content,
        destinationPath,
        destinationLocalFileName
    }: {
        content: string;
        destinationPath: string;
        destinationLocalFileName: string;
    }): Promise<string | null> {
        if (!this.useRemote) {
            localFileService.putIntegrationFile({ fileName: destinationLocalFileName, fileContent: content });

            return '_LOCAL_FILE_';
        }

        try {
            await this.getStore().put(destinationPath, content);

            return destinationPath;
        } catch (err) {
            report(err);

            return null;
        }
    }

    async checkIfChanged({ content, objectKey }: { content: string; objectKey: string }): Promise<boolean> {
        if (!this.useRemote) {
            return true;
        }

        return !(await this.getStore().hasSameContent(objectKey, content));
    }

    /**
     * Copy
     * @desc copy an existing public integration file to user's location in remote storage,
     * on local copy to the set local destination
     */
    async copy({
        sourcePath,
        destinationPath,
        destinationLocalFileName
    }: {
        sourcePath: string;
        destinationPath: string;
        /**
         * sic
         * Destination when not uploading to remote storage
         * This method handles when remote storage is not enabled (like locally)
         * TODO: We probably need to do it outside but until now it's like this
         */
        destinationLocalFileName: string;
    }): Promise<string | null> {
        const sourceKey = `${this.publicZeroYamlRoute}/${sourcePath}`;
        try {
            if (isCloud) {
                await this.getStore().copy(sourceKey, destinationPath);

                return destinationPath;
            } else {
                const fileContent = await this.getFile(sourceKey);
                if (fileContent) {
                    localFileService.putIntegrationFile({ fileName: destinationLocalFileName, fileContent });
                }
                return '_LOCAL_FILE_';
            }
        } catch (err) {
            report(err, { filePath: sourceKey });

            return null;
        }
    }

    getFile(fileName: string): Promise<string> {
        return this.getStore().get(fileName);
    }

    async getStream(fileName: string): Promise<ServiceResponse<Readable | null>> {
        try {
            const body = await this.getStore().getStream(fileName);

            if (body) {
                return { success: true, error: null, response: body };
            }
            return { success: false, error: null, response: null };
        } catch {
            const error = new NangoError('integration_file_not_found');
            return { success: false, error, response: null };
        }
    }

    async deleteFiles(fileNames: string[]): Promise<void> {
        if (!isCloud && !this.useRemote) {
            return;
        }

        await this.getStore().delete(fileNames);
    }

    async zipAndSendPublicFiles({
        res,
        scriptName,
        providerPath,
        flowType
    }: {
        res: Response;
        scriptName: string;
        providerPath: string;
        flowType: string;
    }): Promise<void> {
        // TODO: handle zero yaml here

        const files: { name: string; content: Readable }[] = [];
        const { success, error, response: nangoYaml } = await this.getStream(`${this.publicRoute}/${providerPath}/${nangoConfigFile}`);
        if (!success || nangoYaml === null) {
            errorManager.errResFromNangoErr(res, error);
            return;
        }
        files.push({ name: 'nango.yaml', content: nangoYaml });

        const {
            success: tsSuccess,
            error: tsError,
            response: tsFile
        } = await this.getStream(`${this.publicRoute}/${providerPath}/${flowType}s/${scriptName}.ts`);
        if (!tsSuccess || tsFile === null) {
            errorManager.errResFromNangoErr(res, tsError);
            return;
        }
        files.push({ name: `${scriptName}.ts`, content: tsFile });

        await this.zipAndSend({ res, files });
    }

    async zipAndSendFlow({ res, syncConfig, providerConfigKey }: { res: Response; syncConfig: DBSyncConfig; providerConfigKey: string }): Promise<void> {
        if (!isCloud && !this.useRemote) {
            return localFileService.zipAndSendFlow({ res, syncConfig, providerConfigKey });
        } else {
            const files: { name: string; content: Readable }[] = [];
            if (!syncConfig.sdk_version?.includes('-zero')) {
                const nangoConfigLocation = syncConfig.file_location.split('/').slice(0, -3).join('/');
                const resGet = await this.getStream(`${nangoConfigLocation}/${nangoConfigFile}`);
                if (!resGet.success || !resGet.response) {
                    errorManager.errResFromNangoErr(res, resGet.error);
                    return;
                }
                files.push({ name: 'nango.yaml', content: resGet.response });
            }

            const scriptName = syncConfig.sync_name;

            const jsFileLocation = syncConfig.file_location;
            const { success: jsSuccess, error: jsError, response: jsFile } = await this.getStream(jsFileLocation);
            if (!jsSuccess || jsFile === null) {
                errorManager.errResFromNangoErr(res, jsError);
                return;
            }
            files.push({ name: `${scriptName}.js`, content: jsFile });

            const tsFileLocation = syncConfig.file_location.split('/').slice(0, -1).join('/');
            const { success: tsSuccess, error: tsError, response: tsFile } = await this.getStream(`${tsFileLocation}/${scriptName}.ts`);
            if (!tsSuccess || tsFile === null) {
                errorManager.errResFromNangoErr(res, tsError);
                return;
            }
            files.push({ name: `${scriptName}.ts`, content: tsFile });

            await this.zipAndSend({ res, files, nangoConfigId: syncConfig.nango_config_id });
        }
    }

    async zipAndSend({ res, files, nangoConfigId }: { res: Response; files: { name: string; content: Readable }[]; nangoConfigId?: number }) {
        const archive = archiver('zip');

        archive.on('error', (err) => {
            report(err, { files: files.map((f) => f.name).join(', '), nangoConfigId });

            errorManager.errResFromNangoErr(res, new NangoError('error_creating_zip_file'));
            return;
        });

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=nango-integrations.zip`);

        archive.pipe(res);

        for (const file of files) {
            archive.append(file.content, { name: file.name });
        }

        await archive.finalize();
    }
}

export default new RemoteFileService();
