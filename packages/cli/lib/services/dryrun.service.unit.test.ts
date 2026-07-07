import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '../utils/result.js';
import { DryRunService } from './dryrun.service.js';
import { NangoSyncCLI } from './sdk.js';

const mocks = vi.hoisted(() => ({
    getConfig: vi.fn(),
    getConnection: vi.fn(),
    parseIntegrationDefinitions: vi.fn(),
    parseSecretKey: vi.fn()
}));

vi.mock('../utils.js', () => ({
    getConfig: mocks.getConfig,
    getConnection: mocks.getConnection,
    parseSecretKey: mocks.parseSecretKey,
    printDebug: vi.fn(),
    resolveHostport: () => 'https://api.nango.dev'
}));

vi.mock('../zeroYaml/definitions.js', () => ({
    parseIntegrationDefinitions: mocks.parseIntegrationDefinitions
}));

const parsedDefinitions = {
    integrations: [
        {
            providerConfigKey: 'github',
            syncs: [
                {
                    name: 'syncIssues',
                    type: 'sync',
                    output: [],
                    json_schema: null
                }
            ],
            actions: [],
            onEventScripts: { 'post-connection-creation': [], 'pre-connection-deletion': [], 'validate-connection': [] }
        }
    ]
};

function buildService() {
    return new DryRunService({ fullPath: '/tmp/nango-integrations', validation: false, environment: 'dev' });
}

describe('DryRunService', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        mocks.parseSecretKey.mockResolvedValue(undefined);
        mocks.parseIntegrationDefinitions.mockResolvedValue(Ok(parsedDefinitions as any));
        mocks.getConnection.mockResolvedValue(
            Ok({
                id: 1,
                connection_id: 'conn-1',
                provider_config_key: 'github'
            } as any)
        );
        mocks.getConfig.mockResolvedValue(Ok({ data: { provider: 'github' } } as any));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it('returns a Result success when the dry run completes', async () => {
        const service = buildService();
        vi.spyOn(service, 'runScript').mockResolvedValue({ success: true, error: null, response: null } as any);

        const result = await service.run({ sync: 'syncIssues', connectionId: 'conn-1' } as any);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toBeUndefined();
        }
    });

    it('returns a Result error when the environment is missing', async () => {
        const service = new DryRunService({ fullPath: '/tmp/nango-integrations', validation: false });

        const result = await service.run({ sync: 'syncIssues', connectionId: 'conn-1' } as any);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('Environment is required');
        }
        expect(mocks.parseSecretKey).not.toHaveBeenCalled();
    });

    it('returns a Result error when no script matches', async () => {
        const result = await buildService().run({ sync: 'missingSync', connectionId: 'conn-1' } as any);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('No script matched "missingSync"');
        }
        expect(mocks.getConnection).not.toHaveBeenCalled();
    });

    it('returns a Result error when connection lookup fails', async () => {
        mocks.getConnection.mockResolvedValue(Err(new Error('connection lookup failed')));

        const result = await buildService().run({ sync: 'syncIssues', connectionId: 'conn-1' } as any);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('connection lookup failed');
        }
    });

    it('returns a Result error when config lookup fails', async () => {
        mocks.getConfig.mockResolvedValue(Err(new Error('config lookup failed')));

        const result = await buildService().run({ sync: 'syncIssues', connectionId: 'conn-1' } as any);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('config lookup failed');
        }
    });

    it('returns a Result error when input JSON cannot be parsed', async () => {
        const result = await buildService().run({ sync: 'syncIssues', connectionId: 'conn-1', input: '{bad json' } as any);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('Failed to parse --input');
        }
    });

    it('returns a Result error when checkpoint JSON is invalid', async () => {
        const result = await buildService().run({ sync: 'syncIssues', connectionId: 'conn-1', checkpoint: '{"cursor":{"nested":true}}' } as any);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toContain('Invalid checkpoint');
        }
    });

    it('returns a Result error when script execution fails', async () => {
        const service = buildService();
        vi.spyOn(service, 'runScript').mockResolvedValue({ success: false, error: new Error('script failed'), response: null });

        const result = await service.run({ sync: 'syncIssues', connectionId: 'conn-1' } as any);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('script failed');
        }
    });

    describe('--json mode', () => {
        beforeEach(() => {
            vi.spyOn(process.stdout, 'write');
        });

        it('writes a JSON envelope to stdout on success', async () => {
            const service = buildService();
            vi.spyOn(service, 'runScript').mockResolvedValue({ success: true, error: null, response: null } as any);

            const result = await service.run({ sync: 'syncIssues', connectionId: 'conn-1', outputJson: true } as any);

            expect(result.isOk()).toBe(true);
            expect(process.stdout.write).toHaveBeenCalledTimes(1);
            const written = (process.stdout.write as any).mock.calls[0][0] as string;
            const envelope = JSON.parse(written);
            expect(envelope).toMatchObject({ ok: true, error: null, output: null, logs: null });
        });

        it('writes an error JSON envelope to stdout on script failure', async () => {
            const service = buildService();
            vi.spyOn(service, 'runScript').mockResolvedValue({ success: false, error: new Error('script failed'), response: null });

            const result = await service.run({ sync: 'syncIssues', connectionId: 'conn-1', outputJson: true } as any);

            expect(result.isErr()).toBe(true);
            expect(process.stdout.write).toHaveBeenCalledTimes(1);
            const written = (process.stdout.write as any).mock.calls[0][0] as string;
            const envelope = JSON.parse(written);
            expect(envelope.ok).toBe(false);
            expect(envelope.error.message).toContain('script failed');
        });

        it('writes an error JSON envelope on unexpected exception', async () => {
            const service = buildService();
            vi.spyOn(service, 'runScript').mockRejectedValue(new Error('unexpected error'));

            const result = await service.run({ sync: 'syncIssues', connectionId: 'conn-1', outputJson: true } as any);

            expect(result.isErr()).toBe(true);
            expect(process.stdout.write).toHaveBeenCalledTimes(1);
            const written = (process.stdout.write as any).mock.calls[0][0] as string;
            const envelope = JSON.parse(written);
            expect(envelope.ok).toBe(false);
            expect(envelope.error.message).toContain('unexpected error');
        });

        it('does not write JSON envelope when outputJson is not set', async () => {
            const service = buildService();
            vi.spyOn(service, 'runScript').mockResolvedValue({ success: true, error: null, response: null } as any);

            await service.run({ sync: 'syncIssues', connectionId: 'conn-1' } as any);

            expect(process.stdout.write).not.toHaveBeenCalled();
        });

        it('preserves exit code on script error', async () => {
            const service = buildService();
            vi.spyOn(service, 'runScript').mockResolvedValue({ success: false, error: new Error('script failed'), response: null });

            const result = await service.run({ sync: 'syncIssues', connectionId: 'conn-1', outputJson: true } as any);

            expect(result.isErr()).toBe(true);
        });

        it('writes an error JSON envelope on early guard failure (missing environment)', async () => {
            const service = new DryRunService({ fullPath: '/tmp/nango-integrations', validation: false });

            const result = await service.run({ sync: 'syncIssues', connectionId: 'conn-1', outputJson: true } as any);

            expect(result.isErr()).toBe(true);
            expect(process.stdout.write).toHaveBeenCalledTimes(1);
            const written = (process.stdout.write as any).mock.calls[0][0] as string;
            const envelope = JSON.parse(written);
            expect(envelope.ok).toBe(false);
            expect(envelope.error.message).toBe('Environment is required');
        });

        it('writes an error JSON envelope on early guard failure (no script matched)', async () => {
            const result = await buildService().run({ sync: 'missingSync', connectionId: 'conn-1', outputJson: true } as any);

            expect(result.isErr()).toBe(true);
            expect(process.stdout.write).toHaveBeenCalledTimes(1);
            const written = (process.stdout.write as any).mock.calls[0][0] as string;
            const envelope = JSON.parse(written);
            expect(envelope.ok).toBe(false);
            expect(envelope.error.message).toBe('No script matched "missingSync"');
        });

        it('includes requests and diagnostics fields in the success envelope', async () => {
            const service = buildService();
            vi.spyOn(service, 'runScript').mockResolvedValue({ success: true, error: null, response: null } as any);

            await service.run({ sync: 'syncIssues', connectionId: 'conn-1', outputJson: true } as any);

            const written = (process.stdout.write as any).mock.calls[0][0] as string;
            const envelope = JSON.parse(written);
            expect(envelope.requests).toEqual([]);
            expect(envelope.diagnostics).toBeNull();
        });

        it('includes sync records in output for sync scripts', async () => {
            const service = buildService();
            const rawSaveOutput = new Map<string, unknown[]>([['GithubIssue', [{ id: 1 }, { id: 2 }]]]);
            vi.spyOn(service, 'runScript').mockResolvedValue({
                success: true,
                error: null,
                response: {
                    output: undefined,
                    nango: Object.assign(Object.create(NangoSyncCLI.prototype), {
                        rawSaveOutput,
                        logMessages: { counts: { added: 2, updated: 0, deleted: 0 }, messages: [] }
                    })
                }
            } as any);

            const result = await service.run({ sync: 'syncIssues', connectionId: 'conn-1', outputJson: true } as any);

            expect(result.isOk()).toBe(true);
            const written = (process.stdout.write as any).mock.calls[0][0] as string;
            const envelope = JSON.parse(written);
            expect(envelope.ok).toBe(true);
            expect(envelope.output).toEqual({ GithubIssue: [{ id: 1 }, { id: 2 }] });
        });

        it('includes action output in envelope for action scripts', async () => {
            const service = buildService();
            const actionOutput = { result: 'hello' };
            vi.spyOn(service, 'runScript').mockResolvedValue({
                success: true,
                error: null,
                response: { output: actionOutput, nango: null }
            } as any);

            const parsedWithAction = {
                integrations: [
                    {
                        providerConfigKey: 'github',
                        syncs: [],
                        actions: [{ name: 'myAction', type: 'action', output: ['MyModel'] }],
                        onEventScripts: { 'post-connection-creation': [], 'pre-connection-deletion': [], 'validate-connection': [] }
                    }
                ]
            };
            mocks.parseIntegrationDefinitions.mockResolvedValue(Ok(parsedWithAction as any));

            const result = await service.run({
                sync: 'myAction',
                connectionId: 'conn-1',
                outputJson: true
            } as any);

            expect(result.isOk()).toBe(true);
            expect(process.stdout.write).toHaveBeenCalledTimes(1);
            const written = (process.stdout.write as any).mock.calls[0][0] as string;
            const envelope = JSON.parse(written);
            expect(envelope.ok).toBe(true);
            expect(envelope.output).toEqual(actionOutput);
        });
    });
});
