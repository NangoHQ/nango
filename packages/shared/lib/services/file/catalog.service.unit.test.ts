import { Readable } from 'stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

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
    CopyObjectCommand: vi.fn().mockImplementation((input: Record<string, unknown>) => ({ input, __cmd: 'CopyObjectCommand' }))
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

async function loadServiceWithEnv(env: Partial<typeof mockEnv>) {
    Object.assign(mockEnv, { isCloud: false, isEnterprise: false, useS3: false, isLocal: false, isTest: false }, env);
    vi.resetModules();
    const localModule = await import('./local.service.js');
    const catalogModule = await import('./catalog.service.js');
    return { catalogFileService: catalogModule.catalogFileService, localFileService: localModule.default };
}

function bodyStream(content: string): Readable {
    return Readable.from([Buffer.from(content)]);
}

const coords = { env: 'ignored', accountId: 42, environmentId: 99, configId: 17, providerConfigKey: 'github' };

describe('catalogFileService.copyTemplate', () => {
    afterEach(() => {
        mockS3Send.mockReset();
    });

    it('in cloud mode: issues two CopyObjectCommands with correct S3 source and destination keys', async () => {
        const { catalogFileService } = await loadServiceWithEnv({ isCloud: true, useS3: true });
        mockS3Send.mockResolvedValue({});

        const result = await catalogFileService.copyFunction({
            provider: 'gh',
            script: { scriptName: 'fn', scriptType: 'sync', version: '1.0.0' },
            coords
        });

        expect(result.jsLocation).toMatch(/\/account\/42\/environment\/99\/config\/17\/fn-v1\.0\.0\.js$/);
        expect(result.tsLocation).toMatch(/\/account\/42\/environment\/99\/config\/17\/fn\.ts$/);

        expect(mockS3Send).toHaveBeenCalledTimes(2);
        const cmds = mockS3Send.mock.calls.map((c) => c[0] as { __cmd: string; input: { Key: string; CopySource: string } });
        expect(cmds[0]!.__cmd).toBe('CopyObjectCommand');
        expect(cmds[0]!.input.CopySource).toMatch(/\/templates-zero\/gh\/build\/gh_syncs_fn\.cjs$/);
        expect(cmds[1]!.input.CopySource).toMatch(/\/templates-zero\/gh\/syncs\/fn\.ts$/);
    });

    it('uses scriptTypeToPath for on-event scripts in the S3 source key', async () => {
        const { catalogFileService } = await loadServiceWithEnv({ isCloud: true, useS3: true });
        mockS3Send.mockResolvedValue({});

        await catalogFileService.copyFunction({
            provider: 'slack',
            script: { scriptName: 'install', scriptType: 'on-event', version: '0.1.0' },
            coords
        });

        const jsSource = (mockS3Send.mock.calls[0]![0] as { input: { CopySource: string } }).input.CopySource;
        const tsSource = (mockS3Send.mock.calls[1]![0] as { input: { CopySource: string } }).input.CopySource;
        expect(jsSource).toMatch(/\/templates-zero\/slack\/build\/slack_on-events_install\.cjs$/);
        expect(tsSource).toMatch(/\/templates-zero\/slack\/on-events\/install\.ts$/);
    });

    it('in non-cloud mode: fetches via GetObject and writes locally (preserves pre-refactor "silently requires S3" behavior)', async () => {
        const { catalogFileService, localFileService } = await loadServiceWithEnv({ isCloud: false, useS3: false, isLocal: true });
        mockS3Send.mockImplementation((cmd: { __cmd: string }) => {
            if (cmd.__cmd === 'GetObjectCommand') return Promise.resolve({ Body: bodyStream('template-contents') });
            return Promise.resolve({});
        });
        const spy = vi.spyOn(localFileService, 'putIntegrationFile').mockReturnValue(true);

        const result = await catalogFileService.copyFunction({
            provider: 'gh',
            script: { scriptName: 'fn', scriptType: 'sync', version: '1.0.0' },
            coords
        });

        // Sentinel return value is preserved
        expect(result.jsLocation).toBe('_LOCAL_FILE_');
        expect(result.tsLocation).toBe('_LOCAL_FILE_');

        // Two GetObjectCommands (one JS, one TS) were issued
        const getCalls = mockS3Send.mock.calls.filter((c) => (c[0] as { __cmd: string }).__cmd === 'GetObjectCommand');
        expect(getCalls).toHaveLength(2);

        // Two local writes happened
        expect(spy).toHaveBeenCalledTimes(2);
        const fileNames = spy.mock.calls.map((c) => c[0].fileName);
        expect(fileNames).toContain('build/gh-syncs-fn.cjs');
        expect(fileNames).toContain('github/syncs/fn.ts');

        spy.mockRestore();
    });

    it('returns {null, null} on JS copy failure and does not attempt the TS copy', async () => {
        const { catalogFileService } = await loadServiceWithEnv({ isCloud: true, useS3: true });
        mockS3Send.mockRejectedValue(new Error('S3 error'));

        const result = await catalogFileService.copyFunction({
            provider: 'gh',
            script: { scriptName: 'fn', scriptType: 'sync', version: '1.0.0' },
            coords
        });

        expect(result).toEqual({ jsLocation: null, tsLocation: null });
    });
});
