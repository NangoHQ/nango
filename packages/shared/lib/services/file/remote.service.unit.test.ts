import { Readable } from 'stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DBSyncConfig } from '@nangohq/types';
import type { Response } from 'express';

const { mockS3Send, mockEnv } = vi.hoisted(() => ({
    mockS3Send: vi.fn(),
    mockEnv: {
        isCloud: false,
        isEnterprise: false,
        useS3: false,
        isLocal: false,
        isTest: false
    }
}));

vi.mock('@aws-sdk/client-s3', () => ({
    S3Client: vi.fn().mockImplementation(() => ({ send: mockS3Send })),
    GetObjectCommand: vi.fn().mockImplementation((input: Record<string, unknown>) => ({ input, __cmd: 'GetObjectCommand' })),
    PutObjectCommand: vi.fn().mockImplementation((input: Record<string, unknown>) => ({ input, __cmd: 'PutObjectCommand' })),
    CopyObjectCommand: vi.fn().mockImplementation((input: Record<string, unknown>) => ({ input, __cmd: 'CopyObjectCommand' })),
    DeleteObjectsCommand: vi.fn().mockImplementation((input: Record<string, unknown>) => ({ input, __cmd: 'DeleteObjectsCommand' }))
}));

vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        get isCloud() {
            return mockEnv.isCloud;
        },
        get isEnterprise() {
            return mockEnv.isEnterprise;
        },
        get useS3() {
            return mockEnv.useS3;
        },
        get isLocal() {
            return mockEnv.isLocal;
        },
        get isTest() {
            return mockEnv.isTest;
        }
    };
});

// Spies on localFileService must be set up against the same module instance the service imports.
// Obtain it from the mocked module graph after resetModules each time.
async function loadServiceWithEnv(env: Partial<typeof mockEnv>) {
    Object.assign(mockEnv, { isCloud: false, isEnterprise: false, useS3: false, isLocal: false, isTest: false }, env);
    vi.resetModules();
    const localModule = await import('./local.service.js');
    const remoteModule = await import('./remote.service.js');
    return { remoteFileService: remoteModule.default, localFileService: localModule.default };
}

function bodyStream(content: string): Readable {
    return Readable.from([Buffer.from(content)]);
}

function makeSyncConfig(overrides: Partial<DBSyncConfig> = {}): DBSyncConfig {
    return {
        sync_name: 'my-sync',
        type: 'sync',
        sdk_version: '1.0.0-zero',
        file_location: 'dev/account/1/environment/2/config/3/my-sync-v1.0.0.js',
        nango_config_id: 3,
        ...overrides
    } as DBSyncConfig;
}

function makeResponseStub() {
    const headers: Record<string, string> = {};
    const chunks: Buffer[] = [];
    let status: number | null = null;
    let body: unknown;
    const finished: { promise: Promise<void>; resolve: () => void } = (() => {
        let resolve!: () => void;
        const promise = new Promise<void>((r) => (resolve = r));
        return { promise, resolve };
    })();

    const res = {
        setHeader(k: string, v: string) {
            headers[k] = v;
        },
        status(c: number) {
            status = c;
            return this;
        },
        send(b: unknown) {
            body = b;
            finished.resolve();
            return this;
        },
        json(b: unknown) {
            body = b;
            finished.resolve();
            return this;
        },
        write(chunk: Buffer | string) {
            chunks.push(Buffer.from(chunk));
            return true;
        },
        end(chunk?: Buffer | string) {
            if (chunk) chunks.push(Buffer.from(chunk));
            finished.resolve();
        },
        on() {
            return this;
        },
        once() {
            return this;
        },
        emit() {
            return true;
        },
        pipe(_dest: unknown) {
            return _dest;
        }
    } as unknown as Response & {
        headers: Record<string, string>;
        chunks: Buffer[];
        finished: Promise<void>;
        statusCode: () => number | null;
        body: () => unknown;
    };

    return {
        res,
        headers,
        chunks,
        finished: finished.promise,
        get status() {
            return status;
        },
        get body() {
            return body;
        }
    };
}

describe('RemoteFileService', () => {
    afterEach(() => {
        mockS3Send.mockReset();
    });

    // Old `upload` and `copy` methods have been removed — their behavior is now covered by
    // the domain-method tests below (uploadCompiledJs/TsSource/NangoYaml) and catalog.service.unit.test.ts.

    describe('getFile', () => {
        it('resolves with concatenated body string on success', async () => {
            const { remoteFileService } = await loadServiceWithEnv({ isCloud: true, useS3: true });
            mockS3Send.mockResolvedValue({ Body: bodyStream('file-contents') });

            const result = await remoteFileService.getFile('some/key');
            expect(result).toBe('file-contents');
            const cmd = mockS3Send.mock.calls[0]![0] as { input: { Key: string }; __cmd: string };
            expect(cmd.__cmd).toBe('GetObjectCommand');
            expect(cmd.input.Key).toBe('some/key');
        });

        it('rejects when response body is not a Readable stream', async () => {
            const { remoteFileService } = await loadServiceWithEnv({ isCloud: true, useS3: true });
            mockS3Send.mockResolvedValue({ Body: undefined });
            await expect(remoteFileService.getFile('key')).rejects.toThrow(/not a Readable stream/);
        });
    });

    describe('deleteFiles', () => {
        it('sends DeleteObjectsCommand with exact keys when useS3', async () => {
            const { remoteFileService } = await loadServiceWithEnv({ isCloud: true, useS3: true });
            mockS3Send.mockResolvedValue({});

            await remoteFileService.deleteFiles(['a', 'b', 'c']);
            expect(mockS3Send).toHaveBeenCalledOnce();
            const cmd = mockS3Send.mock.calls[0]![0] as { input: { Delete: { Objects: { Key: string }[] } }; __cmd: string };
            expect(cmd.__cmd).toBe('DeleteObjectsCommand');
            expect(cmd.input.Delete.Objects).toEqual([{ Key: 'a' }, { Key: 'b' }, { Key: 'c' }]);
        });

        it('short-circuits and performs no S3 call when !isCloud && !useS3', async () => {
            const { remoteFileService } = await loadServiceWithEnv({ isCloud: false, useS3: false, isLocal: true });
            await remoteFileService.deleteFiles(['a', 'b']);
            expect(mockS3Send).not.toHaveBeenCalled();
        });
    });

    describe('zipAndSendFlow', () => {
        function hasZipMagic(chunks: Buffer[]): boolean {
            const combined = Buffer.concat(chunks);
            return combined.length >= 4 && combined[0] === 0x50 && combined[1] === 0x4b && combined[2] === 0x03 && combined[3] === 0x04;
        }

        it('in S3 mode with -zero sdk: fetches JS + TS (no yaml), pipes a valid zip archive', async () => {
            const { remoteFileService } = await loadServiceWithEnv({ isCloud: true, useS3: true });

            // getStream uses the same mockS3Send; give each call a new body stream.
            mockS3Send.mockImplementation((cmd: { __cmd: string; input: { Key: string } }) => {
                if (cmd.__cmd !== 'GetObjectCommand') return Promise.resolve({});
                return Promise.resolve({ Body: bodyStream(`body-of-${cmd.input.Key}`) });
            });

            const captured = makeResponseStub();
            const syncConfig = makeSyncConfig({ sdk_version: '1.0.0-zero' });

            await remoteFileService.zipAndSendFlow({ res: captured.res, syncConfig, providerConfigKey: 'pk' });
            // wait a tick for archive.finalize() to flush into our res.write collector
            await new Promise((r) => setTimeout(r, 50));

            expect(captured.headers['Content-Type']).toBe('application/zip');
            expect(captured.headers['Content-Disposition']).toBe('attachment; filename=nango-integrations.zip');

            // Two GetObjectCommand calls: JS at file_location, TS at dirOf(file_location)/${sync_name}.ts
            const keys = mockS3Send.mock.calls.map((c) => (c[0] as { input: { Key: string } }).input.Key);
            expect(keys).toContain('dev/account/1/environment/2/config/3/my-sync-v1.0.0.js');
            expect(keys).toContain('dev/account/1/environment/2/config/3/my-sync.ts');
            expect(keys).not.toContain('dev/account/1/environment/2/nango.yaml');

            expect(hasZipMagic(captured.chunks)).toBe(true);
        });

        it('in S3 mode without -zero sdk: also fetches nango.yaml at envRootOf(file_location)/nango.yaml', async () => {
            const { remoteFileService } = await loadServiceWithEnv({ isCloud: true, useS3: true });

            mockS3Send.mockImplementation((cmd: { __cmd: string; input: { Key: string } }) => {
                if (cmd.__cmd !== 'GetObjectCommand') return Promise.resolve({});
                return Promise.resolve({ Body: bodyStream(`body-of-${cmd.input.Key}`) });
            });

            const captured = makeResponseStub();
            const syncConfig = makeSyncConfig({ sdk_version: '1.0.0' });

            await remoteFileService.zipAndSendFlow({ res: captured.res, syncConfig, providerConfigKey: 'pk' });
            await new Promise((r) => setTimeout(r, 50));

            const keys = mockS3Send.mock.calls.map((c) => (c[0] as { input: { Key: string } }).input.Key);
            expect(keys).toContain('dev/account/1/environment/2/nango.yaml');
            expect(keys).toContain('dev/account/1/environment/2/config/3/my-sync-v1.0.0.js');
            expect(keys).toContain('dev/account/1/environment/2/config/3/my-sync.ts');

            expect(hasZipMagic(captured.chunks)).toBe(true);
        });
    });

    describe('domain methods (Phase 2)', () => {
        it('getCompiledJs reads from syncConfig.file_location via getFile', async () => {
            const { remoteFileService } = await loadServiceWithEnv({ isCloud: true, useS3: true });
            mockS3Send.mockResolvedValue({ Body: bodyStream('compiled-body') });

            const result = await remoteFileService.getCompiledJs({
                syncConfig: makeSyncConfig({ file_location: 'dev/account/1/environment/2/config/3/sync-v1.0.0.js' }),
                providerConfigKey: 'ignored'
            });
            expect(result).toBe('compiled-body');
            const key = (mockS3Send.mock.calls[0]![0] as { input: { Key: string } }).input.Key;
            expect(key).toBe('dev/account/1/environment/2/config/3/sync-v1.0.0.js');
        });

        it('getCompiledJs returns null on S3 error', async () => {
            const { remoteFileService } = await loadServiceWithEnv({ isCloud: true, useS3: true });
            mockS3Send.mockRejectedValue(new Error('NoSuchKey'));

            const result = await remoteFileService.getCompiledJs({
                syncConfig: makeSyncConfig(),
                providerConfigKey: 'ignored'
            });
            expect(result).toBeNull();
        });

        it('getFunctionTsCode derives TS key from dirOf(file_location)/${sync_name}.ts', async () => {
            const { remoteFileService } = await loadServiceWithEnv({ isCloud: true, useS3: true });
            mockS3Send.mockResolvedValue({ Body: bodyStream('ts-body') });

            const result = await remoteFileService.getSourceTs({
                syncConfig: makeSyncConfig({
                    sync_name: 'fetch',
                    file_location: 'dev/account/1/environment/2/config/3/fetch-v1.0.0.js'
                }),
                providerConfigKey: 'ignored'
            });
            expect(result).toBe('ts-body');
            const key = (mockS3Send.mock.calls[0]![0] as { input: { Key: string } }).input.Key;
            expect(key).toBe('dev/account/1/environment/2/config/3/fetch.ts');
        });

        it('uploadCompiledJs builds the deployed JS key and returns it', async () => {
            const { remoteFileService } = await loadServiceWithEnv({ isCloud: true, useS3: true });
            mockS3Send.mockResolvedValue({});

            const result = await remoteFileService.uploadCompiledJs({
                content: 'compiled',
                coords: { env: 'test-env-ignored', accountId: 42, environmentId: 99, configId: 17, providerConfigKey: 'gh' },
                script: { scriptName: 'my-sync', scriptType: 'sync', version: '1.0.0' }
            });
            // env is read from @nangohq/utils inside the service — in test it'll be whatever vitest NODE_ENV sets.
            // We assert the tail of the key matches the non-env prefix fields.
            expect(result).toMatch(/\/account\/42\/environment\/99\/config\/17\/my-sync-v1\.0\.0\.js$/);
            const cmd = mockS3Send.mock.calls[0]![0] as { __cmd: string; input: { Key: string; Body: string } };
            expect(cmd.__cmd).toBe('PutObjectCommand');
            expect(cmd.input.Body).toBe('compiled');
        });

        it('uploadCompiledJs returns null when the S3 upload fails', async () => {
            const { remoteFileService } = await loadServiceWithEnv({ isCloud: true, useS3: true });
            mockS3Send.mockRejectedValue(new Error('upload failed'));

            const result = await remoteFileService.uploadCompiledJs({
                content: 'compiled',
                coords: { env: 'test-env-ignored', accountId: 42, environmentId: 99, configId: 17, providerConfigKey: 'gh' },
                script: { scriptName: 'my-sync', scriptType: 'sync', version: '1.0.0' }
            });

            expect(result).toBeNull();
        });

        it('uploadTsSource builds the deployed TS key', async () => {
            const { remoteFileService } = await loadServiceWithEnv({ isCloud: true, useS3: true });
            mockS3Send.mockResolvedValue({});

            const result = await remoteFileService.uploadSourceTs({
                content: 'ts',
                coords: { env: 'ignored', accountId: 42, environmentId: 99, configId: 17, providerConfigKey: 'gh' },
                script: { scriptName: 'my-sync', scriptType: 'sync' }
            });
            expect(result).toMatch(/\/account\/42\/environment\/99\/config\/17\/my-sync\.ts$/);
        });

        it('uploadNangoYaml builds the env-scoped yaml key', async () => {
            const { remoteFileService } = await loadServiceWithEnv({ isCloud: true, useS3: true });
            mockS3Send.mockResolvedValue({});

            const result = await remoteFileService.uploadNangoYaml({
                content: 'models: {}',
                coords: { env: 'ignored', accountId: 42, environmentId: 99 }
            });
            expect(result).toMatch(/\/account\/42\/environment\/99\/nango\.yaml$/);
        });

        it('uploadNangoYaml returns null when the S3 upload fails', async () => {
            const { remoteFileService } = await loadServiceWithEnv({ isCloud: true, useS3: true });
            mockS3Send.mockRejectedValue(new Error('upload failed'));

            const result = await remoteFileService.uploadNangoYaml({
                content: 'models: {}',
                coords: { env: 'ignored', accountId: 42, environmentId: 99 }
            });

            expect(result).toBeNull();
        });

        it('deleteDeployedFiles delegates to deleteFiles', async () => {
            const { remoteFileService } = await loadServiceWithEnv({ isCloud: true, useS3: true });
            mockS3Send.mockResolvedValue({});

            await remoteFileService.deleteDeployedFiles(['a', 'b']);
            const cmd = mockS3Send.mock.calls[0]![0] as { __cmd: string; input: { Delete: { Objects: { Key: string }[] } } };
            expect(cmd.__cmd).toBe('DeleteObjectsCommand');
            expect(cmd.input.Delete.Objects).toEqual([{ Key: 'a' }, { Key: 'b' }]);
        });
    });
});
