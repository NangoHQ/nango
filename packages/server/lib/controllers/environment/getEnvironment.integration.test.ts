import { v7 as uuidV7 } from 'uuid';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { customerKeyService, externalWebhookService, getGlobalOAuthCallbackUrl, seeders } from '@nangohq/shared';
import { Err } from '@nangohq/utils';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

import type { AccountApiKeyScope, GetPublicEnvironment } from '@nangohq/types';

const route = '/environments/:environmentUuid';
let api: Awaited<ReturnType<typeof runServer>>;
let keyIndex = 0;
const flags = {
    on_sync_completion_always: true,
    on_auth_creation: false,
    on_auth_refresh_error: true,
    on_sync_error: false,
    on_async_action_completion: true,
    on_connection_deletion: false
};

async function setup(scopes: AccountApiKeyScope[] = ['account:environments:read']) {
    const seed = await seeders.seedAccountEnvAndUser();
    const key = (
        await customerKeyService.createAccountApiKey(db.knex, {
            accountId: seed.account.id,
            displayName: `Read environment ${keyIndex++}`,
            scopes
        })
    ).unwrap();
    return { ...seed, key };
}

function getEnvironment(environmentUuid: string, token?: string, query: GetPublicEnvironment['Querystring'] = {}) {
    return api.fetch(route, {
        method: 'GET',
        ...(token !== undefined && { token }),
        params: { environmentUuid },
        query
    });
}

describe('GET /environments/:environmentUuid', () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('requires authentication', async () => {
        shouldBeProtected(await getEnvironment(uuidV7()));
    });

    it.each(['account:environments:create', 'account:environments:list', 'account:environments:read_secret'] satisfies AccountApiKeyScope[])(
        "requires 'account:environments:read' scope when granted %s",
        async (...scopes) => {
            const { env, key } = await setup(scopes);
            const res = await getEnvironment(env.uuid, key.secret);
            expect(res.res.status).toBe(403);
        }
    );

    it('rejects environment keys', async () => {
        const { env, apiKey } = await setup();
        const res = await getEnvironment(env.uuid, apiKey.secret);
        expect(res.res.status).toBe(403);
    });

    it("explicitly rejects requested secrets without 'account:environments:read_secret' before reading them", async () => {
        const { env, key } = await setup();
        const secretRead = vi.spyOn(customerKeyService, 'getUncachedWebhookSigningKeyForEnv');
        const res = await getEnvironment(env.uuid, key.secret, { with_secrets: 'true' });
        expect(res.res.status).toBe(403);
        isError(res.json);
        expect(res.json.error).toEqual({ code: 'forbidden', message: 'Insufficient scope. Required: account:environments:read_secret' });
        expect(secretRead).not.toHaveBeenCalled();
    });

    it.each([
        { withSecrets: undefined, scopes: ['account:environments:read', 'account:environments:read_secret'] },
        { withSecrets: undefined, scopes: ['account:*'] },
        { withSecrets: 'false', scopes: ['account:*'] }
    ] satisfies { withSecrets: 'false' | undefined; scopes: AccountApiKeyScope[] }[])(
        'returns only public fields for $scopes with with_secrets=$withSecrets',
        async ({ withSecrets, scopes }) => {
            const { env, key } = await setup(scopes);
            await db
                .knex('_nango_environments')
                .where({ id: env.id })
                .update({
                    otlp_settings: { endpoint: 'https://example.com/otlp', headers: { Authorization: 'private-token' } }
                });
            // The endpoint expects a webhook configuration
            await externalWebhookService.update(db.knex, {
                environment_id: env.id,
                data: { ...flags, primary_url: 'https://example.com/primary', secondary_url: 'https://example.com/secondary' }
            });
            const res = await getEnvironment(env.uuid, key.secret, withSecrets ? { with_secrets: withSecrets } : {});
            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data.webhooks).not.toHaveProperty('signing_key');
            expect(res.json.data).not.toHaveProperty('otlp_headers');
        }
    );

    it.each([['account:environments:read', 'account:environments:read_secret'], ['account:*']] satisfies AccountApiKeyScope[][])(
        'returns secrets with explicit scopes or an account wildcard (%j)',
        async (...scopes) => {
            const { env, key } = await setup(scopes);
            await db
                .knex('_nango_environments')
                .where({ id: env.id })
                .update({ otlp_settings: { endpoint: 'https://example.com', headers: { Authorization: 'private-token' } } });
            const rotated = (await customerKeyService.rotateWebhookSigningKey(db.knex, env.id)).unwrap();
            // Simulate another process still holding the old signing cache.
            vi.spyOn(customerKeyService, 'getWebhookSigningKeyForEnv').mockResolvedValue(Err(new Error('cached reader must not be used')));
            const res = await getEnvironment(env.uuid, key.secret, { with_secrets: 'true' });
            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data.webhooks.signing_key).toBe(rotated);
            expect(res.json.data.otlp_headers).toEqual([{ name: 'Authorization', value: 'private-token' }]);
        }
    );

    it('returns defaults when optional configuration is absent', async () => {
        const { env, key } = await setup(['account:*']);
        await db.knex('_nango_environments').where({ id: env.id }).update({ callback_url: null, otlp_settings: null });
        const res = await getEnvironment(env.uuid, key.secret, { with_secrets: 'true' });
        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.callback_url).toBe(getGlobalOAuthCallbackUrl());
        expect(res.json.data.otlp_endpoint).toBeNull();
        expect(res.json.data.otlp_headers).toEqual([]);
    });

    it('returns 500 when the environment webhook configuration is missing', async () => {
        const { env, key } = await setup(['account:*']);
        await db.knex('_nango_external_webhooks').where({ environment_id: env.id }).delete();
        const secretRead = vi.spyOn(customerKeyService, 'getUncachedWebhookSigningKeyForEnv');
        const res = await getEnvironment(env.uuid, key.secret, { with_secrets: 'true' });
        expect(res.res.status).toBe(500);
        expect(res.json).toEqual({ error: { code: 'server_error', message: 'Failed to retrieve webhook configuration' } });
        expect(secretRead).not.toHaveBeenCalled();
    });

    it('returns 500 rather than silently omitting an unavailable signing key', async () => {
        const { env, key } = await setup(['account:*']);
        vi.spyOn(customerKeyService, 'getUncachedWebhookSigningKeyForEnv').mockResolvedValue(Err(new Error('unavailable')));
        const res = await getEnvironment(env.uuid, key.secret, { with_secrets: 'true' });
        expect(res.res.status).toBe(500);
        expect(res.json).toEqual({ error: { code: 'server_error', message: 'Failed to retrieve webhook signing key' } });
    });

    it('hides missing, deleted and other-account environments', async () => {
        const { env, key } = await setup();
        const other = await seeders.seedAccountEnvAndUser();
        await db.knex('_nango_environments').where({ id: env.id }).update({ deleted: true });
        for (const environmentUuid of [uuidV7(), env.uuid, other.env.uuid]) {
            const res = await getEnvironment(environmentUuid, key.secret);
            expect(res.res.status).toBe(404);
        }
    });

    it('rejects malformed UUIDs', async () => {
        const { key } = await setup();
        const res = await getEnvironment('invalid', key.secret);
        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json.error.code).toBe('invalid_uri_params');
    });

    it.each([{ with_secrets: 'yes' }, { with_secrets: '' }, { with_secrets: ['true', 'false'] }, { unknown: 'value' }])(
        'rejects invalid queries %j',
        async (query) => {
            const { env, key } = await setup();
            const res = await getEnvironment(env.uuid, key.secret, query as never);
            expect(res.res.status).toBe(400);
            isError(res.json);
            expect(res.json.error.code).toBe('invalid_query_params');
        }
    );
});
