import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { sandboxApiKeyService } from '@nangohq/sandbox';
import { customerKeyService, seeders } from '@nangohq/shared';

import { isError, runServer, shouldBeProtected } from '../../utils/tests.js';

import type { DBFunctionDeployment, DBFunctionDryrun } from '@nangohq/sandbox';
import type { ApiKeyScope, FunctionSource, ScriptTypeLiteral } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;
const asyncJobsTableName = 'function_async_jobs';

async function seedAccount(scopes?: ApiKeyScope[]) {
    const seed = await seeders.seedAccountEnvAndUser();
    if (scopes) {
        await db.knex('customer_keys').where('id', seed.apiKey.id).update({ scopes });
    }
    return seed;
}

async function createApiKeyWithScopes(seed: Awaited<ReturnType<typeof seedAccount>>, scopes: string[]) {
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
        .knex(asyncJobsTableName)
        .insert({
            environment_id: environmentId,
            job_type: 'dryrun',
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

async function createDeploymentSeed({
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
}): Promise<DBFunctionDeployment> {
    const rows = (await db
        .knex(asyncJobsTableName)
        .insert({
            environment_id: environmentId,
            job_type: 'deployment',
            request: {
                type: 'function',
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: functionType,
                code: 'export default {}',
                allow_destructive: false
            },
            status: 'running',
            ...(sandboxId ? { sandbox_id: sandboxId } : {}),
            ...(startedAt ? { started_at: startedAt } : {}),
            ...(executionTimeoutAt ? { execution_timeout_at: executionTimeoutAt } : {})
        })
        .returning('*')) as DBFunctionDeployment[];

    const row = rows[0];
    if (!row) {
        throw new Error('Failed to create deployment seed');
    }

    return row;
}

async function createExistingFunctionConfig({
    environmentId,
    configId,
    functionName,
    functionType = 'sync',
    source = 'repo'
}: {
    environmentId: number;
    configId: number;
    functionName: string;
    functionType?: ScriptTypeLiteral;
    source?: FunctionSource;
}) {
    const now = new Date();

    await db.knex('_nango_sync_configs').insert({
        environment_id: environmentId,
        nango_config_id: configId,
        sync_name: functionName,
        type: functionType,
        source,
        file_location: 'file_location',
        version: '1',
        models: [],
        active: true,
        runs: 'runs',
        track_deletes: false,
        auto_start: false,
        webhook_subscriptions: [],
        enabled: true,
        created_at: now,
        updated_at: now
    });
}

describe('functions public API', () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
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

    it('rejects POST /functions/dryruns without dryrun scope', async () => {
        const seed = await seedAccount();
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
                message: 'Insufficient scope. Required: environment:functions:dryrun'
            }
        });
    });

    it('rejects POST /functions/deployments without deploy scope', async () => {
        const seed = await seedAccount();
        const apiKey = await createApiKeyWithScopes(seed, ['environment:functions:dryrun']);

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

    it('requires compile scope on POST /functions/compile', async () => {
        const { apiKey } = await seedAccount(['environment:mcp']);

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
        const { apiKey } = await seedAccount(['environment:deploy']);

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
        const { apiKey } = await seedAccount(['environment:functions:compile']);

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

    it('returns connection_not_found on POST /functions/dryruns', async () => {
        const { env, apiKey } = await seedAccount();
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
        const { apiKey } = await seedAccount();

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

    it('returns integration_not_found on POST /functions/deployments', async () => {
        const { apiKey } = await seedAccount();

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

    it('rejects allow_destructive on POST /functions/deployments for repo-managed functions', async () => {
        const { env, apiKey } = await seedAccount(['environment:deploy']);
        const providerConfig = await seeders.createConfigSeed(env, 'github', 'github');
        await createExistingFunctionConfig({
            environmentId: env.id,
            configId: providerConfig.id!,
            functionName: 'syncIssues',
            source: 'repo'
        });

        const res = await api.fetch('/functions/deployments', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                type: 'function',
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}',
                allow_destructive: true
            }
        });

        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_request',
                message: "Cannot overwrite existing function 'syncIssues'"
            }
        });
    });

    it('returns stored dryrun status on GET /functions/dryruns/:id', async () => {
        const { env, apiKey } = await seedAccount(['environment:functions:dryrun']);
        const dryrun = await createDryrunSeed({
            environmentId: env.id,
            sandboxId: 'sandbox-id',
            startedAt: new Date('2099-01-01T00:00:00.000Z'),
            executionTimeoutAt: new Date('2099-01-01T00:10:00.000Z')
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
            started_at: '2099-01-01T00:00:00.000Z'
        });
        expect(res.json).not.toHaveProperty('status_url');
        expect(res.json).not.toHaveProperty('execution_timeout_at');
    });

    it('returns stored deployment status on GET /functions/deployments/:id', async () => {
        const { env, apiKey } = await seedAccount(['environment:deploy']);
        const deployment = await createDeploymentSeed({
            environmentId: env.id,
            sandboxId: 'sandbox-id',
            startedAt: new Date('2099-01-01T00:00:00.000Z'),
            executionTimeoutAt: new Date('2099-01-01T00:05:30.000Z')
        });

        const res = await api.fetch('/functions/deployments/:id', {
            method: 'GET',
            token: apiKey.secret,
            params: { id: deployment.id }
        });

        expect(res.res.status).toBe(200);
        expect(res.json).toMatchObject({
            id: deployment.id,
            status: 'running',
            integration_id: 'github',
            function_name: 'syncIssues',
            function_type: 'sync',
            started_at: '2099-01-01T00:00:00.000Z'
        });
        expect(res.json).not.toHaveProperty('status_url');
        expect(res.json).not.toHaveProperty('execution_timeout_at');
    });

    it('rejects POST /functions/dryruns/:id/result with a customer API key', async () => {
        const { env, apiKey } = await seedAccount(['environment:functions:dryrun']);
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

    it('rejects POST /functions/deployments/:id/result with a customer API key', async () => {
        const { env, apiKey } = await seedAccount(['environment:deploy']);
        const deployment = await createDeploymentSeed({ environmentId: env.id, startedAt: new Date() });

        const res = await fetch(`${api.url}/functions/deployments/${deployment.id}/result`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${apiKey.secret}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({ status: 'success', output: 'Successfully deployed the functions:\n- syncIssues@1' })
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
        const seed = await seedAccount(['environment:functions:dryrun']);
        const apiKey = await createApiKeyWithScopes(seed, ['environment:functions:dryrun']);
        const dryrun = await createDryrunSeed({ environmentId: seed.env.id, functionType: 'action', startedAt: new Date() });
        const sandboxToken = await sandboxApiKeyService.createSandboxApiKey(db.knex, {
            parentApiKeyId: apiKey.id,
            environmentId: seed.env.id,
            purpose: 'dryrun',
            dryrunId: dryrun.id,
            expiresAt: new Date(Date.now() + 60_000)
        });

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
        expect(getRes.json).not.toHaveProperty('status_url');
        expect(getRes.json).not.toHaveProperty('execution_timeout_at');
    });

    it('accepts POST /functions/deployments/:id/result with a sandbox token', async () => {
        const seed = await seedAccount(['environment:deploy']);
        const apiKey = await createApiKeyWithScopes(seed, ['environment:deploy']);
        const deployment = await createDeploymentSeed({ environmentId: seed.env.id, functionType: 'sync', startedAt: new Date() });
        const sandboxToken = await sandboxApiKeyService.createSandboxApiKey(db.knex, {
            parentApiKeyId: apiKey.id,
            environmentId: seed.env.id,
            purpose: 'deploy',
            deploymentId: deployment.id,
            expiresAt: new Date(Date.now() + 60_000)
        });

        const res = await fetch(`${api.url}/functions/deployments/${deployment.id}/result`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${sandboxToken.unwrap()}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                status: 'success',
                output: 'Successfully deployed the functions:\n- syncIssues@1.0.0',
                duration_ms: 123
            })
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toStrictEqual({ ok: true });

        const getRes = await api.fetch('/functions/deployments/:id', {
            method: 'GET',
            token: seed.apiKey.secret,
            params: { id: deployment.id }
        });

        expect(getRes.res.status).toBe(200);
        expect(getRes.json).toMatchObject({
            id: deployment.id,
            status: 'success',
            integration_id: 'github',
            function_name: 'syncIssues',
            function_type: 'sync',
            duration_ms: 123,
            deployed: true,
            deployed_functions: [{ name: 'syncIssues', version: '1.0.0' }],
            output: 'Successfully deployed the functions:\n- syncIssues@1.0.0'
        });
        expect(getRes.json).not.toHaveProperty('status_url');
        expect(getRes.json).not.toHaveProperty('execution_timeout_at');
    });

    it('accepts POST /functions/dryruns/:id/result with a sandbox token from a parent key without dryrun scope', async () => {
        const seed = await seedAccount(['environment:functions:dryrun']);
        const apiKey = await createApiKeyWithScopes(seed, ['environment:connections:read']);
        const dryrun = await createDryrunSeed({ environmentId: seed.env.id, startedAt: new Date() });
        const sandboxToken = await sandboxApiKeyService.createSandboxApiKey(db.knex, {
            parentApiKeyId: apiKey.id,
            environmentId: seed.env.id,
            purpose: 'dryrun',
            dryrunId: dryrun.id,
            expiresAt: new Date(Date.now() + 60_000)
        });

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

    it('rejects POST /functions/deployments/:id/result with a sandbox token for another deployment', async () => {
        const seed = await seedAccount(['environment:deploy']);
        const apiKey = await createApiKeyWithScopes(seed, ['environment:deploy']);
        const deployment = await createDeploymentSeed({ environmentId: seed.env.id, startedAt: new Date() });
        const otherDeployment = await createDeploymentSeed({ environmentId: seed.env.id, startedAt: new Date() });
        const sandboxToken = await sandboxApiKeyService.createSandboxApiKey(db.knex, {
            parentApiKeyId: apiKey.id,
            environmentId: seed.env.id,
            purpose: 'deploy',
            deploymentId: otherDeployment.id,
            expiresAt: new Date(Date.now() + 60_000)
        });

        const res = await fetch(`${api.url}/functions/deployments/${deployment.id}/result`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${sandboxToken.unwrap()}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({ status: 'failed', error: { message: 'Deployment failed' } })
        });

        expect(res.status).toBe(403);
        expect(await res.json()).toStrictEqual({
            error: {
                code: 'forbidden',
                message: 'This sandbox token is not authorized for this deployment'
            }
        });
    });

    it('rejects POST /functions/dryruns/:id/result with a sandbox token for another dryrun', async () => {
        const seed = await seedAccount(['environment:functions:dryrun']);
        const apiKey = await createApiKeyWithScopes(seed, ['environment:functions:dryrun']);
        const dryrun = await createDryrunSeed({ environmentId: seed.env.id, startedAt: new Date() });
        const otherDryrun = await createDryrunSeed({ environmentId: seed.env.id, startedAt: new Date() });
        const sandboxToken = await sandboxApiKeyService.createSandboxApiKey(db.knex, {
            parentApiKeyId: apiKey.id,
            environmentId: seed.env.id,
            purpose: 'dryrun',
            dryrunId: otherDryrun.id,
            expiresAt: new Date(Date.now() + 60_000)
        });

        const res = await fetch(`${api.url}/functions/dryruns/${dryrun.id}/result`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${sandboxToken.unwrap()}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({ status: 'failed', error: { message: 'Compilation failed' } })
        });

        expect(res.status).toBe(403);
        expect(await res.json()).toStrictEqual({
            error: {
                code: 'forbidden',
                message: 'This sandbox token is not authorized for this dryrun'
            }
        });
    });
});
