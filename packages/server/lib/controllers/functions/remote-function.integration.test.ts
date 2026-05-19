import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { customerKeyService, seeders } from '@nangohq/shared';

import { envs } from '../../env.js';
import { isError, runServer, shouldBeProtected } from '../../utils/tests.js';

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

    it('rejects POST /functions/dryrun without dryrun scope', async () => {
        const seed = await seedAccountWithRemoteFunctions();
        const apiKey = await createApiKeyWithScopes(seed, ['environment:connections:read']);

        const res = await api.fetch('/functions/dryrun', {
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
                type: 'single',
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

    it('requires deploy scope on POST /functions/compile', async () => {
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
                message: 'Insufficient scope. Required: environment:deploy'
            }
        });
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

    it('returns connection_not_found on POST /functions/dryrun', async () => {
        const { env, apiKey } = await seedAccountWithRemoteFunctions();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch('/functions/dryrun', {
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

    it('returns integration_not_found on POST /functions/dryrun', async () => {
        const { apiKey } = await seedAccountWithRemoteFunctions();

        const res = await api.fetch('/functions/dryrun', {
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
                type: 'single',
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
});
