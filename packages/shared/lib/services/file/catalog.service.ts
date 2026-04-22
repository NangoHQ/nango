import { CopyObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { env, isCloud, report } from '@nangohq/utils';

import localFileService from './local.service.js';
import { catalogPaths, deployedPaths, scriptTypeToPath } from './paths.js';

import type { DeploymentCoords, ScriptIdentity } from './paths.js';
import type { GetObjectCommandOutput, S3ClientConfig } from '@aws-sdk/client-s3';
import type { Readable } from 'stream';

function getCredentials() {
    const accessKeyId = process.env['AWS_INTEGRATIONS_ACCESS_KEY_ID'] || process.env['AWS_ACCESS_KEY_ID'];
    const secretAccessKey = process.env['AWS_INTEGRATIONS_SECRET_ACCESS_KEY'] || process.env['AWS_SECRET_ACCESS_KEY'];
    if (!accessKeyId || !secretAccessKey) return undefined;
    return { accessKeyId, secretAccessKey };
}

function getRegion() {
    return process.env['AWS_INTEGRATIONS_REGION'] || process.env['AWS_REGION'] || 'us-west-2';
}

function getBucketName() {
    return process.env['AWS_INTEGRATIONS_BUCKET_NAME'] || process.env['AWS_BUCKET_NAME'] || 'nangodev-customer-integrations';
}

export interface CatalogFileService {
    /**
     * Copy a catalog function's compiled JS + TS source into a customer's deployed location.
     * Returns the destination paths (file_location style) — or nulls on failure.
     */
    copyFunction(args: {
        provider: string;
        script: Pick<ScriptIdentity, 'scriptName' | 'scriptType' | 'version'>;
        coords: DeploymentCoords;
    }): Promise<{ jsLocation: string | null; tsLocation: string | null }>;
}

class CatalogService implements CatalogFileService {
    private client: S3Client;
    bucket = getBucketName();

    constructor() {
        const credentials = getCredentials();
        const config: S3ClientConfig = credentials ? { region: getRegion(), credentials } : { region: getRegion() };
        this.client = new S3Client(config);
    }

    async copyFunction({
        provider,
        script,
        coords
    }: {
        provider: string;
        script: Pick<ScriptIdentity, 'scriptName' | 'scriptType' | 'version'>;
        coords: DeploymentCoords;
    }): Promise<{ jsLocation: string | null; tsLocation: string | null }> {
        const jsSource = catalogPaths.templateJs({ provider, scriptType: script.scriptType, scriptName: script.scriptName });
        const tsSource = catalogPaths.templateTs({ provider, scriptType: script.scriptType, scriptName: script.scriptName });
        const jsDest = deployedPaths.js({
            env,
            accountId: coords.accountId,
            environmentId: coords.environmentId,
            configId: coords.configId,
            scriptName: script.scriptName,
            version: script.version
        });
        const tsDest = deployedPaths.ts({
            env,
            accountId: coords.accountId,
            environmentId: coords.environmentId,
            configId: coords.configId,
            scriptName: script.scriptName
        });

        // Local fallback filenames mirror the historical destinationLocalFileName values used in template.ts
        // to preserve behavior exactly. They look different from the S3 paths on purpose.
        const jsLocalFallback = `build/${provider}-${scriptTypeToPath[script.scriptType]}-${script.scriptName}.cjs`;
        const tsLocalFallback = `${coords.providerConfigKey}/${scriptTypeToPath[script.scriptType]}/${script.scriptName}.ts`;

        const jsLocation = await this.copyOne({ s3Source: jsSource, s3Destination: jsDest, localFallbackName: jsLocalFallback });
        if (!jsLocation) {
            return { jsLocation: null, tsLocation: null };
        }

        const tsLocation = await this.copyOne({ s3Source: tsSource, s3Destination: tsDest, localFallbackName: tsLocalFallback });

        return { jsLocation, tsLocation };
    }

    private async copyOne({
        s3Source,
        s3Destination,
        localFallbackName
    }: {
        s3Source: string;
        s3Destination: string;
        localFallbackName: string;
    }): Promise<string | null> {
        try {
            if (isCloud) {
                // Copy within s3
                await this.client.send(
                    new CopyObjectCommand({
                        Bucket: this.bucket,
                        Key: s3Destination,
                        CopySource: `${this.bucket}/${s3Source}`
                    })
                );
                return s3Destination;
            }

            // Fetch from s3 and write locally for non-cloud
            const content = await this.getFile(s3Source);
            if (content) {
                localFileService.putIntegrationFile({ fileName: localFallbackName, fileContent: content });
            }
            return '_LOCAL_FILE_';
        } catch (err) {
            report(err, { filePath: s3Source });
            return null;
        }
    }

    private getFile(fileName: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.client
                .send(new GetObjectCommand({ Bucket: this.bucket, Key: fileName }))
                .then((response: GetObjectCommandOutput) => {
                    const body = response.Body as Readable | undefined;
                    if (!body || typeof body.on !== 'function') {
                        reject(new Error('Response body is undefined or not a Readable stream'));
                        return;
                    }
                    const chunks: Buffer[] = [];
                    body.once('error', (e) => reject(e));
                    body.on('data', (c: Buffer) => chunks.push(c));
                    body.once('end', () => resolve(Buffer.concat(chunks).toString()));
                })
                .catch((err: unknown) => reject(err as Error));
        });
    }
}

export const catalogFileService: CatalogFileService = new CatalogService();
