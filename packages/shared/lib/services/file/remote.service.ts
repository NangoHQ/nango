import { Readable } from 'stream';

import { CopyObjectCommand, DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import archiver from 'archiver';

import { nangoConfigFile } from '@nangohq/nango-yaml';
import { isCloud, isEnterprise, isLocal, isTest, report } from '@nangohq/utils';

import localFileService from './local.service.js';
import { NangoError } from '../../utils/error.js';
import errorManager from '../../utils/error.manager.js';

import type { ServiceResponse } from '../../models/Generic.js';
import type { GetObjectCommandOutput } from '@aws-sdk/client-s3';
import type { DBSyncConfig } from '@nangohq/types';
import type { Response } from 'express';

class RemoteFileService {
    private client: S3Client;
    private useS3: boolean;

    bucket = (process.env['AWS_BUCKET_NAME'] as string) || 'nangodev-customer-integrations';
    publicRoute = 'integration-templates';
    publicZeroYamlRoute = 'templates-zero';

    constructor() {
        const region = process.env['AWS_REGION'] ?? 'us-west-2';
        if (isEnterprise) {
            this.useS3 = Boolean(process.env['AWS_REGION'] && process.env['AWS_BUCKET_NAME']);
        } else {
            this.useS3 = !isLocal && !isTest;
        }

        this.client = new S3Client({
            region
        });
    }

    async upload({
        content,
        destinationPath,
        destinationLocalPath
    }: {
        content: string;
        destinationPath: string;
        destinationLocalPath: string;
    }): Promise<string | null> {
        if (isEnterprise && !this.useS3) {
            localFileService.putIntegrationFile({ filePath: destinationLocalPath, fileContent: content });

            return '_LOCAL_FILE_';
        }
        if (!this.useS3) {
            return '_LOCAL_FILE_';
        }

        try {
            await this.client.send(
                new PutObjectCommand({
                    Bucket: this.bucket,
                    Key: destinationPath,
                    Body: content
                })
            );

            return destinationPath;
        } catch (err) {
            report(err);

            return null;
        }
    }

    /**
     * Copy
     * @desc copy an existing public integration file to user's location in s3,
     * on local copy to the set local destination
     */
    async copy({
        sourcePath,
        destinationPath,
        destinationLocalPath,
        isZeroYaml
    }: {
        sourcePath: string;
        destinationPath: string;
        isZeroYaml: boolean;
        /**
         * sic
         * Destination when not uploading to S3
         * This method handles when S3 is not enabled (like locally)
         * TODO: We probably need to do it outside but until now it's like this
         */
        destinationLocalPath: string;
    }): Promise<string | null> {
        const s3FilePath = `${isZeroYaml ? this.publicZeroYamlRoute : this.publicRoute}/${sourcePath}`;
        try {
            if (isCloud) {
                await this.client.send(
                    new CopyObjectCommand({
                        Bucket: this.bucket,
                        Key: destinationPath,
                        CopySource: `${this.bucket}/${s3FilePath}`
                    })
                );

                return destinationPath;
            } else {
                const fileContent = await this.getFile(s3FilePath);
                if (fileContent) {
                    localFileService.putIntegrationFile({ filePath: destinationLocalPath, fileContent });
                }
                return '_LOCAL_FILE_';
            }
        } catch (err) {
            report(err, { filePath: s3FilePath });

            return null;
        }
    }

    async getPublicTemplateJsonSchemaFile(integrationName: string): Promise<string | null> {
        return await this.getFile(`${this.publicRoute}/${integrationName}/.nango/schema.json`);
    }

    getFile(fileName: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const getObjectCommand = new GetObjectCommand({
                Bucket: this.bucket,
                Key: fileName
            });
            this.client
                .send(getObjectCommand)
                .then((response: GetObjectCommandOutput) => {
                    if (response.Body && response.Body instanceof Readable) {
                        const responseDataChunks: Buffer[] = [];

                        response.Body.once('error', (err) => reject(err));

                        response.Body.on('data', (chunk) => responseDataChunks.push(chunk));

                        response.Body.once('end', () => resolve(Buffer.concat(responseDataChunks).toString()));
                    } else {
                        reject(new Error('Response body is undefined or not a Readable stream'));
                    }
                })
                .catch((err: unknown) => {
                    reject(err as Error);
                });
        });
    }

    async getStream(fileName: string): Promise<ServiceResponse<Readable | null>> {
        try {
            const getObjectCommand = new GetObjectCommand({
                Bucket: this.bucket,
                Key: fileName
            });

            const response = await this.client.send(getObjectCommand);

            if (response?.Body && response.Body instanceof Readable) {
                return { success: true, error: null, response: response.Body };
            } else {
                return { success: false, error: null, response: null };
            }
        } catch {
            const error = new NangoError('integration_file_not_found');
            return { success: false, error, response: null };
        }
    }

    async deleteFiles(fileNames: string[]): Promise<void> {
        if (!isCloud && !this.useS3) {
            return;
        }

        const deleteObjectsCommand = new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
                Objects: fileNames.map((fileName) => ({ Key: fileName }))
            }
        });

        await this.client.send(deleteObjectsCommand);
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

    async zipAndSendFiles({
        res,
        scriptName,
        providerConfigKey,
        syncConfig
    }: {
        res: Response;
        scriptName: string;
        providerConfigKey: string;
        syncConfig: DBSyncConfig;
    }): Promise<void> {
        if (!isCloud && !this.useS3) {
            return localFileService.zipAndSendFiles({ res, scriptName, providerConfigKey, syncConfig });
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

            const integrationFileLocation = syncConfig.file_location.split('/').slice(0, -1).join('/');
            const { success: tsSuccess, error: tsError, response: tsFile } = await this.getStream(`${integrationFileLocation}/${scriptName}.ts`);
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
