import { Readable } from 'node:stream';

import { CopyObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';

import { contentMd5Hex } from './hash.js';
import { S3ObjectStore } from './s3.js';

import type { S3Client } from '@aws-sdk/client-s3';

function mockClient(send: S3Client['send']): S3Client {
    return { send } as S3Client;
}

describe(S3ObjectStore, () => {
    const bucket = 'integrations';

    it('puts an object', async () => {
        const send = vi.fn().mockResolvedValue({});
        const store = new S3ObjectStore(mockClient(send), bucket);

        await store.put('path/file.js', 'source');

        expect(send).toHaveBeenCalledTimes(1);
        const command = send.mock.calls[0]?.[0];
        expect(command).toBeInstanceOf(PutObjectCommand);
        expect(command).toMatchObject({ input: { Bucket: bucket, Key: 'path/file.js', Body: 'source' } });
    });

    it('gets an object via transformToString', async () => {
        const send = vi.fn().mockResolvedValue({
            Body: { transformToString: () => Promise.resolve('source') }
        });
        const store = new S3ObjectStore(mockClient(send), bucket);

        await expect(store.get('path/file.js')).resolves.toBe('source');
        const command = send.mock.calls[0]?.[0];
        expect(command).toBeInstanceOf(GetObjectCommand);
        expect(command).toMatchObject({ input: { Bucket: bucket, Key: 'path/file.js' } });
    });

    it('gets an object from a Readable body', async () => {
        const send = vi.fn().mockResolvedValue({ Body: Readable.from(['hello', ' world']) });
        const store = new S3ObjectStore(mockClient(send), bucket);

        await expect(store.get('path/file.js')).resolves.toBe('hello world');
    });

    it('returns a Readable stream', async () => {
        const body = Readable.from(['chunk']);
        const send = vi.fn().mockResolvedValue({ Body: body });
        const store = new S3ObjectStore(mockClient(send), bucket);

        await expect(store.getStream('path/file.js')).resolves.toBe(body);
    });

    it('copies within the same bucket', async () => {
        const send = vi.fn().mockResolvedValue({});
        const store = new S3ObjectStore(mockClient(send), bucket);

        await store.copy('src.js', 'dest.js');

        const command = send.mock.calls[0]?.[0];
        expect(command).toBeInstanceOf(CopyObjectCommand);
        expect(command).toMatchObject({ input: { Bucket: bucket, Key: 'dest.js', CopySource: `${bucket}/src.js` } });
    });

    it('percent-encodes CopySource keys', async () => {
        const send = vi.fn().mockResolvedValue({});
        const store = new S3ObjectStore(mockClient(send), bucket);

        await store.copy('path/my file+v1#.js', 'dest.js');

        expect(send.mock.calls[0]?.[0]).toMatchObject({
            input: { CopySource: `${bucket}/path/my%20file%2Bv1%23.js` }
        });
    });

    it('deletes objects and no-ops on an empty list', async () => {
        const send = vi.fn().mockResolvedValue({});
        const store = new S3ObjectStore(mockClient(send), bucket);

        await store.delete([]);
        expect(send).not.toHaveBeenCalled();

        await store.delete(['a.js', 'b.js']);
        const command = send.mock.calls[0]?.[0];
        expect(command).toBeInstanceOf(DeleteObjectsCommand);
        expect(command).toMatchObject({ input: { Bucket: bucket, Delete: { Objects: [{ Key: 'a.js' }, { Key: 'b.js' }] } } });
    });

    it('splits deletes into batches of 1000', async () => {
        const send = vi.fn().mockResolvedValue({});
        const store = new S3ObjectStore(mockClient(send), bucket);
        const keys = Array.from({ length: 1001 }, (_, i) => `${i}.js`);

        await store.delete(keys);

        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[0]?.[0]).toMatchObject({ input: { Delete: { Objects: keys.slice(0, 1000).map((Key) => ({ Key })) } } });
        expect(send.mock.calls[1]?.[0]).toMatchObject({ input: { Delete: { Objects: [{ Key: '1000.js' }] } } });
    });

    it('throws when S3 reports partial delete failures', async () => {
        const send = vi.fn().mockResolvedValue({
            Errors: [{ Key: 'a.js', Code: 'AccessDenied', Message: 'forbidden' }]
        });
        const store = new S3ObjectStore(mockClient(send), bucket);

        await expect(store.delete(['a.js', 'b.js'])).rejects.toThrow(/a\.js: forbidden/);
    });

    it('compares content against the S3 ETag', async () => {
        const content = 'source';
        const send = vi.fn().mockImplementation((command) => {
            if (command instanceof HeadObjectCommand) {
                return Promise.resolve({ ETag: `"${contentMd5Hex(content)}"` });
            }
            return Promise.resolve({});
        });
        const store = new S3ObjectStore(mockClient(send), bucket);

        await expect(store.hasSameContent('path/file.js', content)).resolves.toBe(true);
        await expect(store.hasSameContent('path/file.js', 'other')).resolves.toBe(false);
    });

    it('treats a missing object as different content', async () => {
        const send = vi.fn().mockRejectedValue(new Error('NotFound'));
        const store = new S3ObjectStore(mockClient(send), bucket);

        await expect(store.hasSameContent('missing.js', 'source')).resolves.toBe(false);
    });
});
