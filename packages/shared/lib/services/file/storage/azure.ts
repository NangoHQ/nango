import { Readable } from 'node:stream';

import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';

import { contentMd5Digest } from './hash.js';

import type { AzureObjectStoreConfig } from './resolve.js';
import type { ObjectStore } from './types.js';

export type AzureBlobClient = {
    url: string;
    upload(body: string, contentLength: number, options?: { blobHTTPHeaders?: { blobContentMD5?: Uint8Array } }): Promise<unknown>;
    downloadToBuffer(): Promise<Buffer>;
    download(): Promise<{ readableStreamBody?: NodeJS.ReadableStream | undefined }>;
    beginCopyFromURL(copySource: string): Promise<{ pollUntilDone: () => Promise<unknown> }>;
    deleteIfExists(): Promise<unknown>;
    getProperties(): Promise<{ contentMD5?: Uint8Array | undefined }>;
};

export type AzureContainerClient = {
    getBlockBlobClient(name: string): AzureBlobClient;
};

export class AzureObjectStore implements ObjectStore {
    constructor(private readonly container: AzureContainerClient) {}

    static fromConfig(config: AzureObjectStoreConfig): AzureObjectStore {
        const url = `https://${config.accountName}.blob.core.windows.net`;
        const credential = config.accountKey ? new StorageSharedKeyCredential(config.accountName, config.accountKey) : new DefaultAzureCredential();
        const service = new BlobServiceClient(url, credential);
        return new AzureObjectStore(service.getContainerClient(config.containerName));
    }

    async put(key: string, content: string): Promise<void> {
        const body = Buffer.from(content, 'utf8');
        await this.container.getBlockBlobClient(key).upload(content, body.byteLength, {
            blobHTTPHeaders: { blobContentMD5: contentMd5Digest(content) }
        });
    }

    async get(key: string): Promise<string> {
        const buffer = await this.container.getBlockBlobClient(key).downloadToBuffer();
        return buffer.toString('utf8');
    }

    async getStream(key: string): Promise<Readable | null> {
        const response = await this.container.getBlockBlobClient(key).download();
        if (response.readableStreamBody && response.readableStreamBody instanceof Readable) {
            return response.readableStreamBody;
        }
        return null;
    }

    async copy(sourceKey: string, destinationKey: string): Promise<void> {
        const source = this.container.getBlockBlobClient(sourceKey);
        const destination = this.container.getBlockBlobClient(destinationKey);
        const poller = await destination.beginCopyFromURL(source.url);
        await poller.pollUntilDone();
    }

    async delete(keys: string[]): Promise<void> {
        await Promise.all(keys.map((key) => this.container.getBlockBlobClient(key).deleteIfExists()));
    }

    async hasSameContent(key: string, content: string): Promise<boolean> {
        try {
            const properties = await this.container.getBlockBlobClient(key).getProperties();
            if (!properties.contentMD5) {
                return false;
            }
            return Buffer.from(properties.contentMD5).equals(contentMd5Digest(content));
        } catch {
            return false;
        }
    }
}
