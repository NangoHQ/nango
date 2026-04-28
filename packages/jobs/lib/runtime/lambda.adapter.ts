import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { Err, Ok, getLogger } from '@nangohq/utils';

import { envs } from '../env.js';
import { setAbortFlag } from '../execution/operations/abort.js';
import { getLambdaTenantId, getRoutingId } from '../utils/lambda.js';

import type { RuntimeAdapter } from './adapter.js';
import type { Fleet } from '@nangohq/fleet';
import type { NangoProps, Result, RoutingContext } from '@nangohq/types';

const logger = getLogger('LambdaRuntimeAdapter');

const client = new LambdaClient();
const s3 = new S3Client();

interface LambdaFunction {
    arn: string;
}

interface S3ObjectRef {
    kind: 's3';
    bucket: string;
    key: string;
    versionId?: string;
    etag?: string;
}

export class LambdaRuntimeAdapter implements RuntimeAdapter {
    constructor(private readonly fleet: Fleet) {}

    private async getFunction(params: { nangoProps: NangoProps; routingContext?: RoutingContext | undefined }): Promise<LambdaFunction> {
        const routingId = getRoutingId(params);
        const node = await this.fleet.getRunningNode(routingId);
        if (node.isErr()) {
            throw new Error(`Failed to get running node for routing id '${routingId}'`, { cause: node.error });
        }
        if (!node.value.url) {
            throw new Error(`Running node for routing id '${routingId}' does not have a URL`);
        }
        return {
            arn: node.value.url
        };
    }

    private getPayloadsBucket(): Result<string> {
        const bucket = envs.LAMBDA_PAYLOADS_BUCKET_NAME;
        if (!bucket) {
            return Err(new Error('LAMBDA_PAYLOADS_BUCKET_NAME is not set'));
        }
        return Ok(bucket);
    }

    private async uploadToS3(params: {
        bucket: string;
        key: string;
        body: Buffer;
        contentType: string;
        contentEncoding?: 'gzip';
        skipIfExists?: boolean;
        tagging?: string;
    }): Promise<S3ObjectRef> {
        if (params.skipIfExists) {
            try {
                const head = await s3.send(new HeadObjectCommand({ Bucket: params.bucket, Key: params.key }));
                if (head.LastModified && head.LastModified.getTime() > Date.now() - envs.LAMBDA_PAYLOAD_MAX_AGE_MS) {
                    return {
                        kind: 's3' as const,
                        bucket: params.bucket,
                        key: params.key,
                        ...(head.VersionId && { versionId: head.VersionId }),
                        ...(head.ETag && { etag: head.ETag.replace(/"/g, '') })
                    };
                }
            } catch {
                // fall through to put
            }
        }
        const put = await s3.send(
            new PutObjectCommand({
                Bucket: params.bucket,
                Key: params.key,
                Body: params.body,
                ContentType: params.contentType,
                ...(params.contentEncoding && { ContentEncoding: params.contentEncoding }),
                ...(params.tagging && { Tagging: params.tagging })
            })
        );
        return {
            kind: 's3' as const,
            bucket: params.bucket,
            key: params.key,
            ...(put.VersionId && { versionId: put.VersionId }),
            ...(put.ETag && { etag: put.ETag.replace(/"/g, '') })
        };
    }

    private async uploadCode(params: { nangoProps: NangoProps; code: string }): Promise<S3ObjectRef> {
        const bucketResult = this.getPayloadsBucket();
        if (bucketResult.isErr()) {
            throw new Error(`Failed to get payloads bucket`, { cause: bucketResult.error });
        }
        const bucket = bucketResult.value;
        const body = gzipSync(Buffer.from(params.code, 'utf8'));
        const hash = createHash('sha256').update(params.code).digest('hex');
        const key = `accounts/${params.nangoProps.team.id}/environments/${params.nangoProps.environmentId}/function-code/${hash}.cjs.gz`;
        return this.uploadToS3({
            bucket,
            key,
            body,
            contentType: 'text/plain',
            contentEncoding: 'gzip',
            skipIfExists: true,
            tagging: `type=function-code`
        });
    }

    private async uploadCodeParams(params: { taskId: string; nangoProps: NangoProps; codeParams: object }): Promise<S3ObjectRef> {
        const bucketResult = this.getPayloadsBucket();
        if (bucketResult.isErr()) {
            throw new Error(`Failed to get payloads bucket`, { cause: bucketResult.error });
        }
        const bucket = bucketResult.value;
        const body = gzipSync(Buffer.from(JSON.stringify(params.codeParams), 'utf8'));
        const key = `accounts/${params.nangoProps.team.id}/environments/${params.nangoProps.environmentId}/function-params/${params.taskId}/codeParams.json.gz`;
        return this.uploadToS3({
            bucket,
            key,
            body,
            contentType: 'application/json',
            contentEncoding: 'gzip',
            tagging: `type=function-params`
        });
    }

    private async preparePayload(params: { taskId: string; nangoProps: NangoProps; code: string; codeParams: object }): Promise<Result<string>> {
        const payload = {
            taskId: params.taskId,
            nangoProps: params.nangoProps,
            code: params.code,
            codeParams: params.codeParams
        };
        const payloadString = JSON.stringify(payload);
        const payloadSize = Buffer.byteLength(payloadString, 'utf8');
        if (payloadSize > envs.LAMBDA_PAYLOAD_LIMIT_BYTES) {
            return Err(new Error(`Payload size exceeds limit: ${payloadSize} bytes > ${envs.LAMBDA_PAYLOAD_LIMIT_BYTES} bytes`));
        }
        if (payloadSize > envs.LAMBDA_PAYLOAD_MAX_SIZE_BYTES && envs.LAMBDA_PAYLOADS_BUCKET_NAME) {
            const [codeRef, codeParamsRef] = await Promise.all([this.uploadCode(params), this.uploadCodeParams(params)]);
            return Ok(
                JSON.stringify({
                    taskId: params.taskId,
                    nangoProps: params.nangoProps,
                    codeRef: codeRef,
                    codeParamsRef: codeParamsRef
                })
            );
        } else {
            return Ok(payloadString);
        }
    }

    async invoke(params: {
        taskId: string;
        nangoProps: NangoProps;
        code: string;
        codeParams: object;
        routingContext?: RoutingContext | undefined;
    }): Promise<Result<boolean>> {
        try {
            const func = await this.getFunction({ nangoProps: params.nangoProps, routingContext: params.routingContext });

            const payload = await this.preparePayload(params);
            if (payload.isErr()) {
                return Err(new Error(`Failed to prepare payload`, { cause: payload.error }));
            }
            const command = new InvokeCommand({
                FunctionName: func.arn,
                Payload: payload.value,
                //InvocationType is Event for async invocation, RequestResponse for sync invocation
                InvocationType: 'Event',
                ...(params.routingContext?.plan?.lambda_tenant_isolation && {
                    TenantId: getLambdaTenantId(params.nangoProps)
                })
            });
            await client.send(command);
            return Ok(true);
        } catch (err) {
            logger.error('Lambda was unable to execute the function', err);
            return Err(new Error(`The function runtime was unable to execute the function`, { cause: err }));
        }
    }

    async cancel(params: { taskId: string; nangoProps: NangoProps }): Promise<Result<boolean>> {
        const result = await setAbortFlag(params.taskId);
        if (result.isErr()) {
            return Err(new Error(`Error setting abort flag for task: ${params.taskId}`, { cause: result.error }));
        }
        return Ok(true);
    }
}
