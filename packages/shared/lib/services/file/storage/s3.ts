import { Readable } from 'node:stream';

import { CopyObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

import { etagMatchesContent } from './hash.js';

import type { ObjectStore } from './types.js';
import type { S3Client } from '@aws-sdk/client-s3';

async function streamToString(body: Readable): Promise<string> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body) {
        if (typeof chunk === 'string') {
            chunks.push(Buffer.from(chunk));
        } else if (chunk instanceof Uint8Array) {
            chunks.push(chunk);
        }
    }
    return Buffer.concat(chunks).toString();
}

export class S3ObjectStore implements ObjectStore {
    constructor(
        private readonly client: S3Client,
        private readonly bucket: string
    ) {}

    async put(key: string, content: string): Promise<void> {
        await this.client.send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: content
            })
        );
    }

    async get(key: string): Promise<string> {
        const response = await this.client.send(
            new GetObjectCommand({
                Bucket: this.bucket,
                Key: key
            })
        );

        if (!response.Body) {
            throw new Error('Response body is undefined or not a Readable stream');
        }
        if (typeof response.Body.transformToString === 'function') {
            return response.Body.transformToString();
        }
        if (response.Body instanceof Readable) {
            return streamToString(response.Body);
        }
        throw new Error('Response body is undefined or not a Readable stream');
    }

    async getStream(key: string): Promise<Readable | null> {
        const response = await this.client.send(
            new GetObjectCommand({
                Bucket: this.bucket,
                Key: key
            })
        );

        if (response.Body && response.Body instanceof Readable) {
            return response.Body;
        }
        return null;
    }

    async copy(sourceKey: string, destinationKey: string): Promise<void> {
        await this.client.send(
            new CopyObjectCommand({
                Bucket: this.bucket,
                Key: destinationKey,
                CopySource: `${this.bucket}/${sourceKey}`
            })
        );
    }

    async delete(keys: string[]): Promise<void> {
        if (keys.length === 0) {
            return;
        }

        await this.client.send(
            new DeleteObjectsCommand({
                Bucket: this.bucket,
                Delete: {
                    Objects: keys.map((key) => ({ Key: key }))
                }
            })
        );
    }

    async hasSameContent(key: string, content: string): Promise<boolean> {
        try {
            const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
            return etagMatchesContent(head.ETag, content);
        } catch {
            return false;
        }
    }
}
