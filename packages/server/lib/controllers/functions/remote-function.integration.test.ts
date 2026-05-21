import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { sandboxApiKeyService } from '@nangohq/sandbox';
import { customerKeyService, seeders } from '@nangohq/shared';

import { envs } from '../../env.js';
import { isError, runServer, shouldBeProtected } from '../../utils/tests.js';

import type { DBFunctionDryrun } from '@nangohq/sandbox';
import type { ApiKeyScope } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;
const originalNodeEnv = envs.NODE_ENV;

async function seedAccountWithRemoteFunctions(scopes?: ApiKeyScope[]) {
    const seed = await seeders.seedAccountEnvAndUser({ plan: { remote_functions: true } });
    if (scopes) {
        await db.knex('customer_keys').where('id', seed.apiKey.id).update({ scopes });
    }
    return seed;
}

async function createApiKeyWithScopes(seed: Awaited<ReturnType<typeof seedAccountWithRemoteFunctions>>, scopes: string[]) {
    const key = await customerKeyService.createApiKey(db.knex, {
        accountId: seed.account.id,
        environmentId: seed.env.id,
        displayName: `test-${randomUUID()}`,
        scopes
    });

    return key.unwrap();
}

async function createDryrunSeed({
    environmentId,
    functionType = 'sync',
    sandboxId,
    startedAt,
    executionTimeoutAt
}: {
    environmentId: number;
    functionType?: 'action' | 'sync';
    sandboxId?: string | undefined;
    startedAt?: Date | undefined;
    executionTimeoutAt?: Date | undefined;
}): Promise<DBFunctionDryrun> {
    const rows = (await db
        .knex('function_dryruns')
        .insert({
            environment_id: environmentId,
            request: {
                integration_id: 'github',
                function_name: 'function',
                function_type: functionType,
                code: 'export default {}',
                connection_id: 'conn'
            },
            status: 'running',
            ...(sandboxId ? { sandbox_id: sandboxId } : {}),
            ...(startedAt ? { started_at: startedAt } : {}),
            ...(executionTimeoutAt ? { execution_timeout_at: executionTimeoutAt } : {})
        })
        .returning('*')) as DBFunctionDryrun[];

    const row = rows[0];
    if (!row) {
        throw new Error('Failed to create dryrun seed');
    }

    return row;
}

describe('remote-function public API', () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    afterEach(() => {
        envs.NODE_ENV = originalNodeEnv;
    });

    it('protects POST /remote-function/compile', async () => {
        const res = await api.fetch('/remote-function/compile', {
            method: 'POST',
            body: {
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        shouldBeProtected(res);
    });

    it('protects POST /functions/compile', async () => {
        const res = await api.fetch('/functions/compile', {
            method: 'POST',
            body: {
                code: 'export default {}'
            }
        });

        shouldBeProtected(res);
    });

    it('rejects valid secret keys without remote functions plan flag', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch('/remote-function/compile', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        expect(res.res.status).toBe(403);
        expect(res.json).toStrictEqual({
            error: {
                code: 'forbidden',
                message: 'Remote functions are not enabled for this account'
            }
        });
    });

    it('rejects POST /remote-function/dryrun without dryrun scope', async () => {
        const seed = await seedAccountWithRemoteFunctions();
        const apiKey = await createApiKeyWithScopes(seed, ['environment:connections:read']);

        const res = await api.fetch('/remote-function/dryrun', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}',
                connection_id: 'missing-connection'
            }
        });

        expect(res.res.status).toBe(403);
        expect(res.json).toStrictEqual({
            error: {
                code: 'forbidden',
                message: 'Insufficient scope. Required: environment:dryrun'
            }
        });
    });

    it('rejects POST /functions/dryruns without dryrun scope', async () => {
        const seed = await seedAccountWithRemoteFunctions();
        const apiKey = await createApiKeyWithScopes(seed, ['environment:connections:read']);

        const res = await api.fetch('/functions/dryruns', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: 'github',
                function_type: 'sync',
                code: 'export default {}',
                connection_id: 'missing-connection'
            }
        });

        expect(res.res.status).toBe(403);
        expect(res.json).toStrictEqual({
            error: {
                code: 'forbidden',
                message: 'Insufficient scope. Required: environment:dryrun'
            }
        });
    });

    it('rejects POST /remote-function/deploy without deploy scope', async () => {
        const seed = await seedAccountWithRemoteFunctions();
        const apiKey = await createApiKeyWithScopes(seed, ['environment:dryrun']);

        const res = await api.fetch('/remote-function/deploy', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        expect(res.res.status).toBe(403);
        expect(res.json).toStrictEqual({
            error: {
                code: 'forbidden',
                message: 'Insufficient scope. Required: environment:deploy'
            }
        });
    });

    it('rejects POST /functions/deployments without deploy scope', async () => {
        const seed = await seedAccountWithRemoteFunctions();
        const apiKey = await createApiKeyWithScopes(seed, ['environment:dryrun']);

        const res = await api.fetch('/functions/deployments', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                type: 'function',
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        expect(res.res.status).toBe(403);
        expect(res.json).toStrictEqual({
            error: {
                code: 'forbidden',
                message: 'Insufficient scope. Required: environment:deploy'
            }
        });
    });

    it('rejects unsafe function names on POST /remote-function/compile', async () => {
        const { apiKey } = await seedAccountWithRemoteFunctions();

        const res = await api.fetch('/remote-function/compile', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: 'github',
                function_name: 'bad/name',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json.error.code).toBe('invalid_body');
    });

    it('requires compile scope on POST /functions/compile', async () => {
        const { apiKey } = await seedAccountWithRemoteFunctions(['environment:mcp']);

        const res = await api.fetch('/functions/compile', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                code: 'export default {}'
            }
        });

        expect(res.res.status).toBe(403);
        expect(res.json).toStrictEqual({
            error: {
                code: 'forbidden',
                message: 'Insufficient scope. Required: environment:functions:compile'
            }
        });
    });

    it('rejects deploy-only scope on POST /functions/compile', async () => {
        const { apiKey } = await seedAccountWithRemoteFunctions(['environment:deploy']);

        const res = await api.fetch('/functions/compile', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                code: 'export default {}'
            }
        });

        expect(res.res.status).toBe(403);
        expect(res.json).toStrictEqual({
            error: {
                code: 'forbidden',
                message: 'Insufficient scope. Required: environment:functions:compile'
            }
        });
    });

    it('accepts compile scope on POST /functions/compile', async () => {
        const { apiKey } = await seedAccountWithRemoteFunctions(['environment:functions:compile']);

        const res = await api.fetch('/functions/compile', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                code: ''
            }
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('invalid_body');
    });

    it('returns integration_not_found on POST /remote-function/compile', async () => {
        const { apiKey } = await seedAccountWithRemoteFunctions();

        const res = await api.fetch('/remote-function/compile', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({
            error: {
                code: 'integration_not_found',
                message: "Integration 'github' was not found"
            }
        });
    });

    it('allows valid secret keys in production', async () => {
        envs.NODE_ENV = 'production';

        const { apiKey } = await seedAccountWithRemoteFunctions();

        const res = await api.fetch('/remote-function/compile', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({
            error: {
                code: 'integration_not_found',
                message: "Integration 'github' was not found"
            }
        });
    });

    it('returns connection_not_found on POST /remote-function/dryrun', async () => {
        const { env, apiKey } = await seedAccountWithRemoteFunctions();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch('/remote-function/dryrun', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}',
                connection_id: 'missing-connection'
            }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({
            error: {
                code: 'connection_not_found',
                message: "Connection 'missing-connection' was not found for integration 'github'"
            }
        });
    });

    it('returns connection_not_found on POST /functions/dryruns', async () => {
        const { env, apiKey } = await seedAccountWithRemoteFunctions();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch('/functions/dryruns', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: 'github',
                function_type: 'sync',
                code: 'export default {}',
                connection_id: 'missing-connection'
            }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({
            error: {
                code: 'connection_not_found',
                message: "Connection 'missing-connection' was not found for integration 'github'"
            }
        });
    });

    it('returns integration_not_found on POST /functions/dryruns', async () => {
        const { apiKey } = await seedAccountWithRemoteFunctions();

        const res = await api.fetch('/functions/dryruns', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: 'github',
                function_type: 'sync',
                code: 'export default {}',
                connection_id: 'missing-connection'
            }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({
            error: {
                code: 'integration_not_found',
                message: "Integration 'github' was not found"
            }
        });
    });

    it('returns integration_not_found on POST /remote-function/deploy', async () => {
        const { apiKey } = await seedAccountWithRemoteFunctions();

        const res = await api.fetch('/remote-function/deploy', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({
            error: {
                code: 'integration_not_found',
                message: "Integration 'github' was not found"
            }
        });
    });

    it('returns integration_not_found on POST /functions/deployments', async () => {
        const { apiKey } = await seedAccountWithRemoteFunctions();

        const res = await api.fetch('/functions/deployments', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                type: 'function',
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}'
            }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({
            error: {
                code: 'integration_not_found',
                message: "Integration 'github' was not found"
            }
        });
    });

    it('returns stored dryrun status on GET /functions/dryruns/:id', async () => {
        const { env, apiKey } = await seedAccountWithRemoteFunctions(['environment:dryrun']);
        const dryrun = await createDryrunSeed({
            environmentId: env.id,
            sandboxId: 'sandbox-id',
            startedAt: new Date('2026-01-01T00:00:00.000Z'),
            executionTimeoutAt: new Date('2026-01-01T00:10:00.000Z')
        });

        const res = await api.fetch('/functions/dryruns/:id', {
            method: 'GET',
            token: apiKey.secret,
            params: { id: dryrun.id }
        });

        expect(res.res.status).toBe(200);
        expect(res.json).toMatchObject({
            id: dryrun.id,
            status: 'running',
            integration_id: 'github',
            function_type: 'sync',
            status_url: `/functions/dryruns/${dryrun.id}`,
            started_at: '2026-01-01T00:00:00.000Z',
            execution_timeout_at: '2026-01-01T00:10:00.000Z'
        });
    });

    it('rejects POST /functions/dryruns/:id/result with a customer API key', async () => {
        const { env, apiKey } = await seedAccountWithRemoteFunctions(['environment:dryrun']);
        const dryrun = await createDryrunSeed({ environmentId: env.id, startedAt: new Date() });

        const res = await fetch(`${api.url}/functions/dryruns/${dryrun.id}/result`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${apiKey.secret}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({ status: 'success', output: 'Executing -> function\nDone\n{"ok":true}' })
        });

        const json = (await res.json()) as unknown;
        expect(res.status).toBe(403);
        expect(json).toStrictEqual({
            error: {
                code: 'forbidden',
                message: 'This endpoint only accepts sandbox tokens'
            }
        });
    });

    it('accepts POST /functions/dryruns/:id/result with a sandbox token', async () => {
        const seed = await seedAccountWithRemoteFunctions(['environment:dryrun']);
        const apiKey = await createApiKeyWithScopes(seed, ['environment:dryrun']);
        const sandboxToken = await sandboxApiKeyService.createSandboxApiKey(db.knex, {
            parentApiKeyId: apiKey.id,
            environmentId: seed.env.id,
            purpose: 'dryrun',
            expiresAt: new Date(Date.now() + 60_000)
        });
        const dryrun = await createDryrunSeed({ environmentId: seed.env.id, functionType: 'action', startedAt: new Date() });

        const res = await fetch(`${api.url}/functions/dryruns/${dryrun.id}/result`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${sandboxToken.unwrap()}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({ status: 'success', output: 'Building\nExecuting -> function\nDone\n{"ok":true}', duration_ms: 123 })
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toStrictEqual({ ok: true });

        const getRes = await api.fetch('/functions/dryruns/:id', {
            method: 'GET',
            token: seed.apiKey.secret,
            params: { id: dryrun.id }
        });

        expect(getRes.res.status).toBe(200);
        expect(getRes.json).toMatchObject({
            id: dryrun.id,
            status: 'success',
            integration_id: 'github',
            function_type: 'action',
            duration_ms: 123,
            output: 'Executing -> function\nDone',
            result: { ok: true }
        });
    });

    it('accepts POST /functions/dryruns/:id/result with a sandbox token from a parent key without dryrun scope', async () => {
        const seed = await seedAccountWithRemoteFunctions(['environment:dryrun']);
        const apiKey = await createApiKeyWithScopes(seed, ['environment:connections:read']);
        const sandboxToken = await sandboxApiKeyService.createSandboxApiKey(db.knex, {
            parentApiKeyId: apiKey.id,
            environmentId: seed.env.id,
            purpose: 'dryrun',
            expiresAt: new Date(Date.now() + 60_000)
        });
        const dryrun = await createDryrunSeed({ environmentId: seed.env.id, startedAt: new Date() });

        const res = await fetch(`${api.url}/functions/dryruns/${dryrun.id}/result`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${sandboxToken.unwrap()}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({ status: 'failed', error: { message: 'Compilation failed' } })
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toStrictEqual({ ok: true });
    });
});
