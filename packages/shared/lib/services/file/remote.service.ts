import type { Response } from 'express';
import { CopyObjectCommand, PutObjectCommand, GetObjectCommand, GetObjectCommandOutput, S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import archiver from 'archiver';
import { isCloud, isEnterprise } from '../../utils/utils.js';
import { NangoError } from '../../utils/error.js';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';
import { LogActionEnum } from '../../models/Activity.js';
import type { ServiceResponse } from '../../models/Generic.js';
import { nangoConfigFile } from '../nango-config.service.js';
import localFileService from './local.service.js';

let client: S3Client | null = null;

if (isEnterprise()) {
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

    async upload(fileContents: string, fileName: string, environmentId: number): Promise<string | null> {
        if (isEnterprise()) {
            const fileNameOnly = fileName.split('/').slice(-1)[0];
            const versionStrippedFileName = fileNameOnly?.replace(/-v[\d.]+(?=\.js$)/, '');
            localFileService.putIntegrationFile(versionStrippedFileName as string, fileContents, fileName.endsWith('.js'));

            return '_LOCAL_FILE_';
        }
        if (!isCloud()) {
            return '_LOCAL_FILE_';
        }

        try {
            await client?.send(
                new PutObjectCommand({
                    Bucket: this.bucket,
                    Key: fileName,
                    Body: fileContents
                })
            );

            return fileName;
        } catch (e) {
            await errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                environmentId,
                operation: LogActionEnum.FILE,
                metadata: {
                    fileName
                }
            });

            return null;
        }
    }

    /**
     * Copy
     * @desc copy an existing public integration file to user's location in s3,
     * on local copy to the set local destination
     */
    async copy(integrationName: string, fileName: string, destinationPath: string, environmentId: number): Promise<string | null> {
        try {
            const s3FilePath = `${this.publicRoute}/${integrationName}/${fileName}`;

            if (isCloud()) {
                await client?.send(
                    new CopyObjectCommand({
                        Bucket: this.bucket,
                        Key: destinationPath,
                        CopySource: `${this.bucket}/${s3FilePath}`
                    })
                );

                return destinationPath;
            } else {
                const fileContents = await this.getFile(s3FilePath, environmentId);
                if (fileContents) {
                    localFileService.putIntegrationFile(fileName, fileContents, integrationName.includes('dist'));
                }
                return '_LOCAL_FILE_';
            }
        } catch (e) {
            await errorManager.report(e, {
                source: ErrorSourceEnum.PLATFORM,
                environmentId,
                operation: LogActionEnum.FILE,
                metadata: {
                    fileName
                }
            });

            return null;
        }
    }

    getFile(fileName: string, environmentId: number): Promise<string> {
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
                .catch(async (err) => {
                    await errorManager.report(err, {
                        source: ErrorSourceEnum.PLATFORM,
                        environmentId,
                        operation: LogActionEnum.FILE,
                        metadata: {
                            fileName
                        }
                    });
                    reject(err);
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

            if (response?.Body && response?.Body instanceof Readable) {
                return { success: true, error: null, response: response.Body };
            } else {
                return { success: false, error: null, response: null };
            }
        } catch (e) {
            const error = new NangoError('integration_file_not_found');
            return { success: false, error, response: null };
        }
    }

    async deleteFiles(fileNames: string[]): Promise<void> {
        if (!isCloud()) {
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

    async zipAndSendPublicFiles(res: Response, integrationName: string, accountId: number, environmentId: number, providerPath: string): Promise<void> {
        const { success, error, response: nangoYaml } = await this.getStream(`${this.publicRoute}/${providerPath}/${nangoConfigFile}`);
        if (!success || nangoYaml === null) {
            errorManager.errResFromNangoErr(res, error);
            return;
        }
        const { success: tsSuccess, error: tsError, response: tsFile } = await this.getStream(`${this.publicRoute}/${providerPath}/${integrationName}.ts`);
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
        file_location: string
    ): Promise<void> {
        if (!isCloud()) {
            return localFileService.zipAndSendFiles(res, integrationName, accountId, environmentId, nangoConfigId);
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

        archive.on('error', async (err) => {
            const metadata: Record<string, string | number> = {
                integrationName,
                accountId
            };

            if (nangoConfigId) {
                metadata['nangoConfigId'] = nangoConfigId;
            }
            await errorManager.report(err, {
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

        archive.append(nangoYaml as Readable, { name: nangoConfigFile });
        archive.append(tsFile as Readable, { name: `${integrationName}.ts` });

        await archive.finalize();
    }
}

export default new RemoteFileService();
