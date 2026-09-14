import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { GcsObjectStore } from './gcs.js';
import { contentMd5Base64 } from './hash.js';

import type { GcsBucketClient, GcsFileClient } from './gcs.js';

function memoryBucket(): { bucket: GcsBucketClient; files: Map<string, string> } {
    const files = new Map<string, string>();

    const bucket: GcsBucketClient = {
        file(name: string): GcsFileClient {
            return {
                save(data) {
                    files.set(name, data);
                    return Promise.resolve();
                },
                download() {
                    const content = files.get(name);
                    if (content === undefined) {
                        return Promise.reject(new Error('not found'));
                    }
                    return Promise.resolve([Buffer.from(content)]);
                },
                createReadStream() {
                    return Readable.from([files.get(name) ?? '']);
                },
                copy(destination) {
                    const content = files.get(name);
                    if (content === undefined) {
                        return Promise.reject(new Error('not found'));
                    }
                    files.set(destination, content);
                    return Promise.resolve();
                },
                delete() {
                    files.delete(name);
                    return Promise.resolve();
                },
                exists() {
                    return Promise.resolve([files.has(name)]);
                },
                getMetadata() {
                    const content = files.get(name);
                    if (content === undefined) {
                        return Promise.reject(new Error('not found'));
                    }
                    return Promise.resolve([{ md5Hash: contentMd5Base64(content) }]);
                }
            };
        }
    };

    return { bucket, files };
}

describe(GcsObjectStore, () => {
    it('puts, gets, streams, copies, and deletes', async () => {
        const { bucket, files } = memoryBucket();
        const store = new GcsObjectStore(bucket);

        await store.put('path/file.js', 'source');
        expect(files.get('path/file.js')).toBe('source');
        await expect(store.get('path/file.js')).resolves.toBe('source');

        const stream = await store.getStream('path/file.js');
        expect(stream).toBeInstanceOf(Readable);
        if (!(stream instanceof Readable)) {
            throw new Error('expected a Readable stream');
        }
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        expect(Buffer.concat(chunks).toString()).toBe('source');

        await store.copy('path/file.js', 'path/copy.js');
        expect(files.get('path/copy.js')).toBe('source');

        await store.delete(['path/file.js']);
        expect(files.has('path/file.js')).toBe(false);
        await expect(store.getStream('missing.js')).resolves.toBeNull();
    });

    it('compares content against the GCS md5Hash', async () => {
        const { bucket } = memoryBucket();
        const store = new GcsObjectStore(bucket);
        await store.put('path/file.js', 'source');

        await expect(store.hasSameContent('path/file.js', 'source')).resolves.toBe(true);
        await expect(store.hasSameContent('path/file.js', 'other')).resolves.toBe(false);
        await expect(store.hasSameContent('missing.js', 'source')).resolves.toBe(false);
    });
});
