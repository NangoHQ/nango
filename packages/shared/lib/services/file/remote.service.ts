import { Readable } from 'stream';

import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import archiver from 'archiver';

import { nangoConfigFile } from '@nangohq/nango-yaml';
import { env, isCloud, isEnterprise, isLocal, isTest, report, useS3 } from '@nangohq/utils';

import { deployedPaths } from './paths.js';
import { NangoError } from '../../utils/error.js';
import errorManager from '../../utils/error.manager.js';

import type { FileService } from './index.js';
import type { DeploymentCoords, ScriptIdentity, YamlCoords } from './paths.js';
import type { ServiceResponse } from '../../models/Generic.js';
import type { GetObjectCommandOutput, S3ClientConfig } from '@aws-sdk/client-s3';
import type { DBSyncConfig } from '@nangohq/types';
import type { Response } from 'express';

function getCredentials() {
    const accessKeyId = process.env['AWS_INTEGRATIONS_ACCESS_KEY_ID'] || process.env['AWS_ACCESS_KEY_ID'];
    const secretAccessKey = process.env['AWS_INTEGRATIONS_SECRET_ACCESS_KEY'] || process.env['AWS_SECRET_ACCESS_KEY'];
    if (!accessKeyId || !secretAccessKey) {
        return undefined;
    }
    return {
        accessKeyId,
        secretAccessKey
    };
}

function getRegion() {
    return process.env['AWS_INTEGRATIONS_REGION'] || process.env['AWS_REGION'] || 'us-west-2';
}

function getBucketName() {
    return process.env['AWS_INTEGRATIONS_BUCKET_NAME'] || process.env['AWS_BUCKET_NAME'] || 'nangodev-customer-integrations';
}

class RemoteFileService implements FileService {
    private client: S3Client;
    private useS3: boolean;

    bucket = getBucketName();

    constructor() {
        const region = getRegion();
        if (isEnterprise) {
            this.useS3 = useS3;
        } else {
            this.useS3 = !isLocal && !isTest;
        }
        const credentials = getCredentials();
        const config: S3ClientConfig = credentials ? { region, credentials } : { region };
        this.client = new S3Client(config);
    }

    private async upload({ content, destinationPath }: { content: string; destinationPath: string }): Promise<string | null> {
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

    async zipAndSendFlow({ res, syncConfig }: { res: Response; syncConfig: DBSyncConfig; providerConfigKey: string }): Promise<void> {
        const files: { name: string; content: Readable }[] = [];
        if (!syncConfig.sdk_version?.includes('-zero')) {
            const nangoConfigLocation = deployedPaths.envRootOf(syncConfig.file_location);
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

        const tsFileLocation = deployedPaths.dirOf(syncConfig.file_location);
        const { success: tsSuccess, error: tsError, response: tsFile } = await this.getStream(`${tsFileLocation}/${scriptName}.ts`);
        if (!tsSuccess || tsFile === null) {
            errorManager.errResFromNangoErr(res, tsError);
            return;
        }
        files.push({ name: `${scriptName}.ts`, content: tsFile });

        await this.zipAndSend({ res, files, nangoConfigId: syncConfig.nango_config_id });
    }

    // Domain-level API (matches FileService interface)

    async getCompiledJs({ syncConfig }: { syncConfig: DBSyncConfig; providerConfigKey: string }): Promise<string | null> {
        try {
            return await this.getFile(syncConfig.file_location);
        } catch {
            return null;
        }
    }

    async getSourceTs({ syncConfig }: { syncConfig: DBSyncConfig; providerConfigKey: string }): Promise<string | null> {
        const dir = deployedPaths.dirOf(syncConfig.file_location);
        const tsKey = `${dir}/${syncConfig.sync_name}.ts`;
        try {
            return await this.getFile(tsKey);
        } catch {
            return null;
        }
    }

    async uploadCompiledJs({ content, coords, script }: { content: string; coords: DeploymentCoords; script: ScriptIdentity }): Promise<string | null> {
        const key = deployedPaths.js({
            env,
            accountId: coords.accountId,
            environmentId: coords.environmentId,
            configId: coords.configId,
            scriptName: script.scriptName,
            version: script.version
        });
        return await this.upload({ content, destinationPath: key });
    }

    async uploadSourceTs({
        content,
        coords,
        script
    }: {
        content: string;
        coords: DeploymentCoords;
        script: Pick<ScriptIdentity, 'scriptName' | 'scriptType'>;
    }): Promise<string | null> {
        const key = deployedPaths.ts({
            env,
            accountId: coords.accountId,
            environmentId: coords.environmentId,
            configId: coords.configId,
            scriptName: script.scriptName
        });
        return await this.upload({ content, destinationPath: key });
    }

    async uploadNangoYaml({ content, coords }: { content: string; coords: YamlCoords }): Promise<string | null> {
        const key = deployedPaths.nangoYaml({ env, accountId: coords.accountId, environmentId: coords.environmentId });
        return await this.upload({ content, destinationPath: key });
    }

    async deleteDeployedFiles(fileLocations: string[]): Promise<void> {
        await this.deleteFiles(fileLocations);
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
