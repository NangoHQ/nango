import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { AzureObjectStore } from './azure.js';
import { contentMd5Digest } from './hash.js';

import type { AzureBlobClient, AzureContainerClient } from './azure.js';

function memoryContainer(): { container: AzureContainerClient; files: Map<string, string> } {
    const files = new Map<string, string>();

    const container: AzureContainerClient = {
        getBlockBlobClient(name: string): AzureBlobClient {
            return {
                url: `https://account.blob.core.windows.net/container/${name}`,
                upload(body) {
                    files.set(name, body);
                    return Promise.resolve();
                },
                downloadToBuffer() {
                    const content = files.get(name);
                    if (content === undefined) {
                        return Promise.reject(new Error('not found'));
                    }
                    return Promise.resolve(Buffer.from(content));
                },
                download() {
                    const content = files.get(name);
                    if (content === undefined) {
                        return Promise.reject(new Error('not found'));
                    }
                    return Promise.resolve({ readableStreamBody: Readable.from([content]) });
                },
                beginCopyFromURL(copySource) {
                    const sourceKey = copySource.split('/').slice(4).join('/');
                    const content = files.get(sourceKey);
                    if (content === undefined) {
                        return Promise.reject(new Error('not found'));
                    }
                    files.set(name, content);
                    return Promise.resolve({ pollUntilDone: () => Promise.resolve() });
                },
                deleteIfExists() {
                    files.delete(name);
                    return Promise.resolve();
                },
                getProperties() {
                    const content = files.get(name);
                    if (content === undefined) {
                        return Promise.reject(new Error('not found'));
                    }
                    return Promise.resolve({ contentMD5: contentMd5Digest(content) });
                }
            };
        }
    };

    return { container, files };
}

describe(AzureObjectStore, () => {
    it('puts, gets, streams, copies, and deletes', async () => {
        const { container, files } = memoryContainer();
        const store = new AzureObjectStore(container);

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
    });

    it('compares content against the Azure contentMD5', async () => {
        const { container } = memoryContainer();
        const store = new AzureObjectStore(container);
        await store.put('path/file.js', 'source');

        await expect(store.hasSameContent('path/file.js', 'source')).resolves.toBe(true);
        await expect(store.hasSameContent('path/file.js', 'other')).resolves.toBe(false);
        await expect(store.hasSameContent('missing.js', 'source')).resolves.toBe(false);
    });
});
