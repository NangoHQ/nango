import { PutObjectCommand, GetObjectCommand, GetObjectCommandOutput, S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { isCloud } from '../utils/utils.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import { LogActionEnum } from '../models/Activity.js';

const client = new S3Client({
    region: process.env['AWS_REGION'] as string,
    credentials: {
        accessKeyId: process.env['AWS_ACCESS_KEY_ID'] as string,
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] as string
    }
});

class FileService {
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
}

export default new FileService();
