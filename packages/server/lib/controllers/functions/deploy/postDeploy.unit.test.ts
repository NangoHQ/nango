import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

const mocks = vi.hoisted(() => ({
    knex: {},
    getProviderConfig: vi.fn(),
    getSyncConfigRaw: vi.fn(),
    createEphemeralApiKey: vi.fn(),
    revokeEphemeralApiKey: vi.fn(),
    createSandbox: vi.fn(),
    sandbox: {
        files: { write: vi.fn() },
        commands: { run: vi.fn() },
        kill: vi.fn()
    }
}));

const originalE2BApiKey = process.env['E2B_API_KEY'];

vi.mock('@nangohq/database', () => ({
    default: { knex: mocks.knex }
}));

vi.mock('@nangohq/shared', async () => {
    const z = await import('zod');
    const connectionTagsKeySchema = z.string();
    return {
        TAG_MAX_COUNT: 10,
        connectionTagsKeySchema,
        connectionTagsSchema: z.record(connectionTagsKeySchema, z.string()),
        validateCaseInsensitiveTagKeys: () => [],
        getApiUrl: () => 'http://localhost:3003',
        configService: { getProviderConfig: mocks.getProviderConfig },
        customerKeyService: {
            createEphemeralApiKey: mocks.createEphemeralApiKey,
            revokeEphemeralApiKey: mocks.revokeEphemeralApiKey
        },
        getSyncConfigRaw: mocks.getSyncConfigRaw
    };
});

vi.mock('e2b', () => ({
    Sandbox: { create: mocks.createSandbox },
    CommandExitError: class CommandExitError extends Error {},
    TimeoutError: class TimeoutError extends Error {}
}));

import { postRemoteFunctionDeploy } from './postDeploy.js';

function createResponse(locals: Record<string, unknown>) {
    const res = {
        locals,
        statusCode: undefined as number | undefined,
        body: undefined as unknown,
        status: vi.fn((statusCode: number) => {
            res.statusCode = statusCode;
            return res;
        }),
        send: vi.fn((body: unknown) => {
            res.body = body;
            return res;
        }),
        json: vi.fn((body: unknown) => {
            res.body = body;
            return res;
        })
    };
    return res;
}

describe('postRemoteFunctionDeploy', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env['E2B_API_KEY'] = 'test-e2b-api-key';
        mocks.getProviderConfig.mockResolvedValue({ id: 2 });
        mocks.getSyncConfigRaw.mockResolvedValue(null);
        mocks.createEphemeralApiKey.mockResolvedValue(Ok({ id: 3, secret: 'sandbox-secret' }));
        mocks.revokeEphemeralApiKey.mockResolvedValue(Ok());
        mocks.createSandbox.mockResolvedValue(mocks.sandbox);
        mocks.sandbox.files.write.mockResolvedValue(undefined);
        mocks.sandbox.kill.mockResolvedValue(undefined);
        mocks.sandbox.commands.run.mockResolvedValue({ stdout: '✓ Deployed\n- syncIssues@1', stderr: '' });
    });

    afterEach(() => {
        if (originalE2BApiKey === undefined) {
            delete process.env['E2B_API_KEY'];
        } else {
            process.env['E2B_API_KEY'] = originalE2BApiKey;
        }
    });

    it('creates sandbox keys with only the deploy scope', async () => {
        const req = {
            query: {},
            body: {
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}'
            }
        };
        const res = createResponse({
            account: { id: 1 },
            environment: { id: 2, name: 'dev' },
            apiKeyScopes: ['environment:*']
        });

        await postRemoteFunctionDeploy(req as any, res as any, vi.fn());

        expect(mocks.createEphemeralApiKey).toHaveBeenCalledWith(
            mocks.knex,
            expect.objectContaining({
                accountId: 1,
                environmentId: 2,
                displayName: 'Remote function deploy',
                scopes: ['environment:deploy']
            })
        );
        expect(res.statusCode).toBe(200);
        expect(mocks.sandbox.commands.run).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ envs: expect.objectContaining({ NANGO_SECRET_KEY: 'sandbox-secret' }) })
        );
        expect(mocks.revokeEphemeralApiKey).toHaveBeenCalledWith(mocks.knex, 3, 2);
    });
});
