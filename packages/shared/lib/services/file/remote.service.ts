import type { Response } from 'express';
import { PutObjectCommand, GetObjectCommand, GetObjectCommandOutput, S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import archiver from 'archiver';
import { isCloud } from '../../utils/utils.js';
import errorManager, { ErrorSourceEnum } from '../../utils/error.manager.js';
import { LogActionEnum } from '../../models/Activity.js';
import { nangoConfigFile } from '../nango-config.service.js';
import { getEnv } from '../../utils/utils.js';
import localFileService from './local.service.js';

const client = new S3Client({
    region: process.env['AWS_REGION'] as string,
    credentials: {
        accessKeyId: process.env['AWS_ACCESS_KEY_ID'] as string,
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] as string
    }
});

class RemoteFileService {
    bucket = process.env['AWS_BUCKET_NAME'] as string;

    async upload(fileContents: string, fileName: string, environmentId: number): Promise<string | null> {
        if (!isCloud()) {
            return '_LOCAL_FILE_';
        }

        try {
            await client.send(
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

    getFile(fileName: string, environmentId: number): Promise<string> {
        return new Promise((resolve, reject) => {
            const getObjectCommand = new GetObjectCommand({
                Bucket: this.bucket,
                Key: fileName
            });

            client
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

    async getStream(fileName: string): Promise<Readable | null> {
        const getObjectCommand = new GetObjectCommand({
            Bucket: this.bucket,
            Key: fileName
        });

        const response = await client.send(getObjectCommand);

        if (response.Body && response.Body instanceof Readable) {
            return response.Body;
        } else {
            return null;
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

        await client.send(deleteObjectsCommand);
    }

    async zipAndSendFiles(res: Response, integrationName: string, accountId: number, environmentId: number, nangoConfigId: number): Promise<void> {
        if (!isCloud()) {
            return localFileService.zipAndSendFiles(res, integrationName, accountId, environmentId, nangoConfigId);
        } else {
            const env = getEnv();
            const nangoYaml = await this.getStream(`${env}/account/${accountId}/environment/${environmentId}/${nangoConfigFile}`);

            if (!nangoYaml) {
                // TODO: handle error
                // use the error class
            }
            const tsFile = await this.getStream(`${env}/account/${accountId}/environment/${environmentId}/config/${nangoConfigId}/${integrationName}.ts`);

            if (!tsFile) {
                // TODO: handle error
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

                res.status(500).send('There was an error sending the integration files');
            });

            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename=nango-integrations.zip`);

            archive.pipe(res);

            archive.append(nangoYaml as Readable, { name: nangoConfigFile });
            archive.append(tsFile as Readable, { name: `${integrationName}.ts` });

            await archive.finalize();

            res.sendStatus(200);
        }
    }
}

export default new RemoteFileService();
