import { Storage } from '@google-cloud/storage';

import { deleteEach } from './delete.js';
import { contentMd5Base64 } from './hash.js';

import type { ObjectStore } from './types.js';
import type { Readable } from 'node:stream';

export type GcsFileClient = {
    save(data: string): Promise<unknown>;
    download(): Promise<[Buffer, ...unknown[]]>;
    createReadStream(): Readable;
    copy(destination: string): Promise<unknown>;
    delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
    exists(): Promise<[boolean, ...unknown[]]>;
    getMetadata(): Promise<[{ md5Hash?: string | null | undefined }, ...unknown[]]>;
};

export type GcsBucketClient = {
    file(name: string): GcsFileClient;
};

export class GcsObjectStore implements ObjectStore {
    constructor(private readonly bucket: GcsBucketClient) {}

    static fromBucketName(bucketName: string): GcsObjectStore {
        return new GcsObjectStore(new Storage().bucket(bucketName));
    }

    async put(key: string, content: string): Promise<void> {
        await this.bucket.file(key).save(content);
    }

    async get(key: string): Promise<string> {
        const [contents] = await this.bucket.file(key).download();
        return contents.toString('utf8');
    }

    async getStream(key: string): Promise<Readable | null> {
        const file = this.bucket.file(key);
        const [exists] = await file.exists();
        if (!exists) {
            return null;
        }
        return file.createReadStream();
    }

    async copy(sourceKey: string, destinationKey: string): Promise<void> {
        await this.bucket.file(sourceKey).copy(destinationKey);
    }

    async delete(keys: string[]): Promise<void> {
        await deleteEach(keys, (key) => this.bucket.file(key).delete({ ignoreNotFound: true }), 'GCS');
    }

    async hasSameContent(key: string, content: string): Promise<boolean> {
        try {
            const [metadata] = await this.bucket.file(key).getMetadata();
            return Boolean(metadata.md5Hash) && metadata.md5Hash === contentMd5Base64(content);
        } catch {
            return false;
        }
    }
}
