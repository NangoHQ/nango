import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

const mocks = vi.hoisted(() => ({
    knex: {},
    getConnection: vi.fn(),
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
        connectionService: { getConnection: mocks.getConnection },
        customerKeyService: {
            createEphemeralApiKey: mocks.createEphemeralApiKey,
            revokeEphemeralApiKey: mocks.revokeEphemeralApiKey
        }
    };
});

vi.mock('e2b', () => ({
    Sandbox: { create: mocks.createSandbox },
    CommandExitError: class CommandExitError extends Error {},
    TimeoutError: class TimeoutError extends Error {}
}));

import { postRemoteFunctionDryrun } from './postDryrun.js';

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

describe('postRemoteFunctionDryrun', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env['E2B_API_KEY'] = 'test-e2b-api-key';
        mocks.getConnection.mockResolvedValue({ success: true, response: { id: 1 } });
        mocks.createEphemeralApiKey.mockResolvedValue(Ok({ id: 3, secret: 'sandbox-secret' }));
        mocks.revokeEphemeralApiKey.mockResolvedValue(Ok());
        mocks.createSandbox.mockResolvedValue(mocks.sandbox);
        mocks.sandbox.files.write.mockResolvedValue(undefined);
        mocks.sandbox.kill.mockResolvedValue(undefined);
        mocks.sandbox.commands.run
            .mockResolvedValueOnce({ stdout: '', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'Executing -> integration:"github" script:"syncIssues"\nDone\n{"ok":true}', stderr: '' });
    });

    afterEach(() => {
        if (originalE2BApiKey === undefined) {
            delete process.env['E2B_API_KEY'];
        } else {
            process.env['E2B_API_KEY'] = originalE2BApiKey;
        }
    });

    it('creates sandbox keys with caller scopes and baseline scopes', async () => {
        const req = {
            query: {},
            body: {
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}',
                connection_id: 'conn-1'
            }
        };
        const res = createResponse({
            account: { id: 1 },
            environment: { id: 2, name: 'dev' },
            apiKeyScopes: ['environment:*', 'environment:proxy']
        });

        await postRemoteFunctionDryrun(req as any, res as any, vi.fn());

        expect(mocks.createEphemeralApiKey).toHaveBeenCalledWith(
            mocks.knex,
            expect.objectContaining({
                accountId: 1,
                environmentId: 2,
                displayName: 'Remote function dryrun',
                scopes: ['environment:*', 'environment:proxy', 'environment:connections:read', 'environment:integrations:read']
            })
        );
        expect(res.statusCode).toBe(200);
        expect(mocks.sandbox.commands.run).toHaveBeenNthCalledWith(
            2,
            expect.any(String),
            expect.objectContaining({ envs: expect.objectContaining({ NANGO_SECRET_KEY: 'sandbox-secret' }) })
        );
        expect(mocks.revokeEphemeralApiKey).toHaveBeenCalledWith(mocks.knex, 3, 2);
    });
});
