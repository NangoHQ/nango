import { Readable } from 'stream';

import { CopyObjectCommand, DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import archiver from 'archiver';

import { nangoConfigFile } from '@nangohq/nango-yaml';
import { isCloud, isEnterprise, isLocal, isTest, report } from '@nangohq/utils';

import localFileService from './local.service.js';
import { LogActionEnum } from '../../models/Telemetry.js';
import { NangoError } from '../../utils/error.js';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';

import type { ServiceResponse } from '../../models/Generic.js';
import type { GetObjectCommandOutput } from '@aws-sdk/client-s3';
import type { Response } from 'express';

let client: S3Client | null = null;
let useS3 = !isLocal && !isTest;

if (isEnterprise) {
    useS3 = Boolean(process.env['AWS_REGION'] && process.env['AWS_BUCKET_NAME']);
    client = new S3Client({
        region: (process.env['AWS_REGION'] as string) || 'us-west-2'
    });
} else {
    client = new S3Client({
        region: process.env['AWS_REGION'] as string,
        credentials: {
            accessKeyId: process.env['AWS_ACCESS_KEY_ID'] as string,
            secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] as string
        }
    });
}

class RemoteFileService {
    bucket = (process.env['AWS_BUCKET_NAME'] as string) || 'nangodev-customer-integrations';
    publicRoute = 'integration-templates';

    async upload({
        content,
        destinationPath,
        destinationLocalPath
    }: {
        content: string;
        destinationPath: string;
        destinationLocalPath: string;
    }): Promise<string | null> {
        if (isEnterprise && !useS3) {
            localFileService.putIntegrationFile({ filePath: destinationLocalPath, fileContent: content });

            return '_LOCAL_FILE_';
        }
        if (!useS3) {
            return '_LOCAL_FILE_';
        }

        try {
            await client?.send(
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

    public getRemoteFileLocationForPublicTemplate(integrationName: string, fileName: string): string {
        return `${this.publicRoute}/${integrationName}/dist/${fileName}.js`;
    }

    public async getPublicFlowFile(filePath: string): Promise<string | null> {
        return await this.getFile(filePath);
    }

    /**
     * Copy
     * @desc copy an existing public integration file to user's location in s3,
     * on local copy to the set local destination
     */
    async copy({
        sourcePath,
        destinationPath,
        destinationLocalPath
    }: {
        sourcePath: string;
        destinationPath: string;
        /**
         * sic
         * Destination when not uploading to S3, it should be similar to destinationPath but no
         */
        destinationLocalPath: string;
    }): Promise<string | null> {
        const s3FilePath = `${this.publicRoute}/${sourcePath}`;
        try {
            if (isCloud) {
                await client?.send(
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

            client
                ?.send(getObjectCommand)
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

            const response = await client?.send(getObjectCommand);

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
        if (!isCloud && !useS3) {
            return;
        }

        const deleteObjectsCommand = new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
                Objects: fileNames.map((fileName) => ({ Key: fileName }))
            }
        });

        await client?.send(deleteObjectsCommand);
    }

    async zipAndSendPublicFiles(
        res: Response,
        integrationName: string,
        accountId: number,
        environmentId: number,
        providerPath: string,
        flowType: string
    ): Promise<void> {
        const { success, error, response: nangoYaml } = await this.getStream(`${this.publicRoute}/${providerPath}/${nangoConfigFile}`);
        if (!success || nangoYaml === null) {
            errorManager.errResFromNangoErr(res, error);
            return;
        }
        const {
            success: tsSuccess,
            error: tsError,
            response: tsFile
        } = await this.getStream(`${this.publicRoute}/${providerPath}/${flowType}s/${integrationName}.ts`);
        if (!tsSuccess || tsFile === null) {
            errorManager.errResFromNangoErr(res, tsError);
            return;
        }
        await this.zipAndSend(res, integrationName, nangoYaml, tsFile, environmentId, accountId);
    }

    async zipAndSendFiles(
        res: Response,
        integrationName: string,
        accountId: number,
        environmentId: number,
        nangoConfigId: number,
        file_location: string,
        providerConfigKey: string,
        flowType: string
    ): Promise<void> {
        if (!isCloud && !useS3) {
            return localFileService.zipAndSendFiles(res, integrationName, accountId, environmentId, nangoConfigId, providerConfigKey, flowType);
        } else {
            const nangoConfigLocation = file_location.split('/').slice(0, -3).join('/');
            const { success, error, response: nangoYaml } = await this.getStream(`${nangoConfigLocation}/${nangoConfigFile}`);

            if (!success || nangoYaml === null) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }
            const integrationFileLocation = file_location.split('/').slice(0, -1).join('/');
            const { success: tsSuccess, error: tsError, response: tsFile } = await this.getStream(`${integrationFileLocation}/${integrationName}.ts`);

            if (!tsSuccess || tsFile === null) {
                errorManager.errResFromNangoErr(res, tsError);
                return;
            }

            await this.zipAndSend(res, integrationName, nangoYaml, tsFile, environmentId, accountId, nangoConfigId);
        }
    }

    async zipAndSend(
        res: Response,
        integrationName: string,
        nangoYaml: Readable,
        tsFile: Readable,
        environmentId: number,
        accountId: number,
        nangoConfigId?: number
    ) {
        const archive = archiver('zip');

        archive.on('error', (err) => {
            const metadata: Record<string, string | number> = {
                integrationName,
                accountId
            };

            if (nangoConfigId) {
                metadata['nangoConfigId'] = nangoConfigId;
            }
            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                environmentId,
                operation: LogActionEnum.FILE,
                metadata: {
                    integrationName,
                    accountId,
                    nangoConfigId: nangoConfigId || null
                }
            });

            errorManager.errResFromNangoErr(res, new NangoError('error_creating_zip_file'));
            return;
        });

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=nango-integrations.zip`);

        archive.pipe(res);

        archive.append(nangoYaml, { name: nangoConfigFile });
        archive.append(tsFile, { name: `${integrationName}.ts` });

        await archive.finalize();
    }
}

export default new RemoteFileService();
