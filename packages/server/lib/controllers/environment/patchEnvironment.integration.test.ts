import { v4 as uuid } from 'uuid';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { customerKeyService, environmentService, externalWebhookService, seeders, updatePlan } from '@nangohq/shared';
import { Err } from '@nangohq/utils';

import { runServer, shouldBeProtected } from '../../utils/tests.js';

import type { AccountApiKeyScope, PatchPublicEnvironment } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;
const route = '/environments/:environmentUuid';

async function seed(scopes: AccountApiKeyScope[] = ['account:environments:update']) {
    const context = await seeders.seedAccountEnvAndUser();
    const key = (await customerKeyService.createAccountApiKey(db.knex, { accountId: context.account.id, displayName: 'Environment updater', scopes })).unwrap();
    const patch = (body: PatchPublicEnvironment['Body'], environmentUuid = context.env.uuid) =>
        api.fetch(route, { method: 'PATCH', token: key.secret, params: { environmentUuid }, body });
    return { ...context, key, patch };
}

describe('PATCH /environments/:environmentUuid', () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => api.server.close());
    afterEach(() => vi.restoreAllMocks());

    it('requires an account key with the update scope', async () => {
        const { env, apiKey, key } = await seed(['account:environments:read']);
        const options = { method: 'PATCH' as const, params: { environmentUuid: env.uuid }, body: { slack_notifications: false } };
        shouldBeProtected(await api.fetch(route, options));
        for (const token of [apiKey.secret, key.secret]) {
            expect((await api.fetch(route, { ...options, token })).res.status).toBe(403);
        }
    });

    it('updates environment and webhook settings together and returns only an acknowledgement', async () => {
        const { env, patch } = await seed();
        const { res, json } = await patch({ callback_url: 'https://example.com/callback', webhooks: { primary_url: 'https://example.com/webhook' } });
        expect(res.status).toBe(200);
        expect(json).toEqual({ success: true });
        expect((await environmentService.getByIdWithoutSecrets(env.id))?.callback_url).toBe('https://example.com/callback');
        expect(await externalWebhookService.get(env.id)).toMatchObject({ primary_url: 'https://example.com/webhook' });
    });

    it.each([
        { name: 'clears a webhook URL', webhooks: { primary_url: '' } },
        { name: 'disables a webhook event', webhooks: { on_auth_creation: false } }
    ])('$name while preserving omitted settings', async ({ webhooks }) => {
        const { env, patch } = await seed();
        const initial = { primary_url: 'https://example.com/old', secondary_url: 'https://example.com/keep', on_auth_creation: true, on_sync_error: true };
        (await externalWebhookService.upsert(db.knex, { environment_id: env.id, data: initial })).unwrap();
        expect((await patch({ webhooks })).res.status).toBe(200);
        expect(await externalWebhookService.get(env.id)).toMatchObject({ ...initial, ...webhooks });
        expect((await environmentService.getByIdWithoutSecrets(env.id))?.callback_url).toBe(env.callback_url);
    });

    it('preserves the signing key when updating webhook settings', async () => {
        const { env, patch } = await seed();
        const before = (await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, env.id)).unwrap();
        expect((await patch({ webhooks: { primary_url: 'https://example.com/webhook' } })).res.status).toBe(200);
        expect((await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, env.id)).unwrap()).toBe(before);
    });

    it.each([undefined, {}])('skips webhook persistence when webhook settings are %j', async (webhooks) => {
        const { env, patch } = await seed();
        const before = await externalWebhookService.get(env.id);
        const upsert = vi.spyOn(externalWebhookService, 'upsert');
        expect((await patch({ callback_url: 'https://example.com/callback', ...(webhooks !== undefined && { webhooks }) })).res.status).toBe(200);
        expect(upsert).not.toHaveBeenCalled();
        expect(await externalWebhookService.get(env.id)).toEqual(before);
        expect((await environmentService.getByIdWithoutSecrets(env.id))?.callback_url).toBe('https://example.com/callback');
    });

    it.each([
        {},
        { webhooks: {} },
        { webhooks: { signing_key: uuid() } },
        { unknown: true },
        { hmac_key: 'not-public' },
        { hmac_enabled: true },
        { webhooks: { on_sync_error: null } }
    ])('rejects empty and unsupported updates: %j', async (body) => {
        const { patch } = await seed();
        const { res, json } = await patch(body as PatchPublicEnvironment['Body']);
        expect(res.status).toBe(400);
        expect(json).toMatchObject({ error: { code: 'invalid_body' } });
    });

    it.each(['another account', 'missing'] as const)('rejects an environment that is %s', async (target) => {
        const { patch } = await seed();
        const environmentUuid = target === 'missing' ? uuid() : (await seeders.seedAccountEnvAndUser()).env.uuid;
        expect((await patch({ name: 'changed' }, environmentUuid)).res.status).toBe(404);
    });

    it('rolls back all changes when the webhook write returns an error', async () => {
        const { env, patch } = await seed();
        const environmentBefore = await environmentService.getByIdWithoutSecrets(env.id);
        const webhooksBefore = (await externalWebhookService.upsert(db.knex, { environment_id: env.id, data: { on_sync_error: false } })).unwrap();
        const upsert = externalWebhookService.upsert;
        vi.spyOn(externalWebhookService, 'upsert').mockImplementationOnce(async (...args) => {
            (await upsert(...args)).unwrap();
            return Err(new Error('write failed'));
        });
        const { res } = await patch({ callback_url: 'https://example.com/rollback', webhooks: { on_sync_error: true } });
        expect(res.status).toBe(500);
        expect(await environmentService.getByIdWithoutSecrets(env.id)).toEqual(environmentBefore);
        expect(await externalWebhookService.get(env.id)).toEqual(webhooksBefore);
    });

    it.each([false, true])('requires the additional production scope (granted: %s)', async (granted) => {
        const { env, patch } = await seed(['account:environments:update', ...(granted ? ['account:environments:set_production' as const] : [])]);
        expect((await patch({ is_production: true })).res.status).toBe(granted ? 200 : 403);
        expect((await environmentService.getByIdWithoutSecrets(env.id))?.is_production).toBe(granted);
    });

    it('rejects changing the reserved prod production flag even with the required scopes', async () => {
        const { account, patch } = await seed(['account:environments:update', 'account:environments:set_production']);
        const prod = await seeders.createEnvironmentSeed(account.id, 'prod');
        expect((await patch({ is_production: true }, prod.uuid)).res.status).toBe(400);
    });

    it('rejects renaming the reserved prod environment', async () => {
        const { account, patch } = await seed();
        const prod = await seeders.createEnvironmentSeed(account.id, 'prod');
        const { res, json } = await patch({ name: 'renamed-prod' }, prod.uuid);
        expect(res.status).toBe(400);
        expect(json).toMatchObject({ error: { code: 'cannot_change_prod_environment_name' } });
        expect((await environmentService.getByIdWithoutSecrets(prod.id))?.name).toBe('prod');
    });

    it('rejects duplicate names', async () => {
        const { patch, account } = await seed();
        const other = await seeders.createEnvironmentSeed(account.id, 'other');
        expect((await patch({ name: other.name })).res.status).toBe(409);
    });

    it.each([{ otlp_endpoint: 'https://example.com/otel' }, { otlp_headers: [{ name: 'Authorization', value: 'new-token' }] }])(
        'rejects OTLP updates without entitlement before applying any settings: %j',
        async (body) => {
            const { env, plan, patch } = await seed();
            (await updatePlan(db.knex, { id: plan.id, has_otel: false })).unwrap();
            expect((await patch({ callback_url: 'https://example.com/should-not-change', ...body })).res.status).toBe(403);
            expect((await environmentService.getByIdWithoutSecrets(env.id))?.callback_url).toBe(env.callback_url);
        }
    );

    it.each([
        {
            name: 'updates the OTLP endpoint and preserves headers',
            body: { otlp_endpoint: 'https://example.com/new' },
            expected: { endpoint: 'https://example.com/new', headers: { Old: 'private-otel-token' } }
        },
        {
            name: 'replaces OTLP headers and preserves the endpoint',
            body: { otlp_headers: [{ name: 'Authorization', value: 'new-token' }] },
            expected: { endpoint: 'https://example.com/old', headers: { Authorization: 'new-token' } }
        },
        {
            name: 'clears the OTLP endpoint and headers',
            body: { otlp_endpoint: '', otlp_headers: [] },
            expected: { endpoint: '', headers: {} }
        }
    ])('$name', async ({ body, expected }) => {
        const { env, plan, patch } = await seed();
        (await updatePlan(db.knex, { id: plan.id, has_otel: true })).unwrap();
        (
            await environmentService.updateEnvironment(db.knex, {
                accountId: env.account_id,
                environmentUuid: env.uuid,
                otlpSettings: { endpoint: 'https://example.com/old', headers: { Old: 'private-otel-token' } }
            })
        ).unwrap();
        const { res, json } = await patch(body);
        expect(res.status).toBe(200);
        expect(json).toEqual({ success: true });
        expect((await environmentService.getByIdWithoutSecrets(env.id))?.otlp_settings).toEqual(expected);
    });
});
