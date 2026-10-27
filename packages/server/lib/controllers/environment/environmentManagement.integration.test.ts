import { v7 as uuidV7 } from 'uuid';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import {
    customerKeyService,
    environmentService,
    externalWebhookService,
    getGlobalOAuthCallbackUrl,
    PROD_ENVIRONMENT_NAME,
    seeders,
    updatePlan
} from '@nangohq/shared';
import { Err } from '@nangohq/utils';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

import type { AccountApiKeyScope, DBCustomerKey } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;
let keyIndex = 0;

async function seedAccount() {
    const seed = await seeders.seedAccountEnvAndUser();
    (await updatePlan(db.knex, { id: seed.plan.id, environments_max: 10 })).unwrap();
    return seed;
}

async function createAccountKey(accountId: number, scopes: AccountApiKeyScope[]): Promise<DBCustomerKey> {
    return (
        await customerKeyService.createAccountApiKey(db.knex, {
            accountId,
            displayName: `Environment management ${keyIndex++}`,
            scopes
        })
    ).unwrap();
}

describe('Public environment management', () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('GET /environments', () => {
        it('should be protected', async () => {
            const res = await api.fetch('/environments', { method: 'GET', query: {} });

            shouldBeProtected(res);
        });

        it('should deny environment API keys', async () => {
            const { apiKey } = await seedAccount();

            const res = await api.fetch('/environments', { method: 'GET', token: apiKey.secret, query: {} });

            expect(res.res.status).toBe(403);
            isError(res.json);
            expect(res.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:list'
            });
        });

        it('should deny Account API keys without the read scope', async () => {
            const { account } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:environments:create']);

            const res = await api.fetch('/environments', { method: 'GET', token: accountKey.secret, query: {} });

            expect(res.res.status).toBe(403);
            isError(res.json);
            expect(res.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:list'
            });
        });

        it('should list secret-free environments with the read scope', async () => {
            const { account } = await seedAccount();
            const environment = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: 'readable-environment' })).unwrap()
                .environment;
            const accountKey = await createAccountKey(account.id, ['account:environments:list']);

            const res = await api.fetch('/environments', {
                method: 'GET',
                token: accountKey.secret,
                query: { name: environment.name }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json).toStrictEqual({
                data: [{ id: environment.id, uuid: environment.uuid, name: environment.name, is_production: false }]
            });
        });

        it('should filter by an exact name and return an empty list when there is no match', async () => {
            const { account } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:environments:list']);

            const res = await api.fetch('/environments', {
                method: 'GET',
                token: accountKey.secret,
                query: { name: 'does-not-exist' }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json).toStrictEqual({ data: [] });
        });

        it('should reject invalid query parameters', async () => {
            const { account } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:environments:list']);

            const unknown = await api.fetch('/environments', {
                method: 'GET',
                token: accountKey.secret,
                // @ts-expect-error on purpose
                query: { unknown: 'value' }
            });
            expect(unknown.res.status).toBe(400);

            const invalidName = await api.fetch('/environments', {
                method: 'GET',
                token: accountKey.secret,
                query: { name: '' }
            });
            expect(invalidName.res.status).toBe(400);
        });

        it('should support account:* and isolate environments by account', async () => {
            const first = await seedAccount();
            const second = await seedAccount();
            const firstKey = await createAccountKey(first.account.id, ['account:*']);
            const secondEnvironment = (
                await environmentService.createEnvironment(db.knex, { accountId: second.account.id, name: 'other-account-environment' })
            ).unwrap().environment;

            const res = await api.fetch('/environments', {
                method: 'GET',
                token: firstKey.secret,
                query: { name: secondEnvironment.name }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json).toStrictEqual({ data: [] });
        });
    });

    describe('POST /environments', () => {
        it('should be protected', async () => {
            const res = await api.fetch('/environments', {
                method: 'POST',
                body: { name: 'unauthenticated' }
            });

            shouldBeProtected(res);
        });

        it('should reject an unknown API key', async () => {
            const res = await api.fetch('/environments', {
                method: 'POST',
                token: '00000000-0000-4000-8000-000000000000',
                body: { name: 'unknown-key' }
            });

            expect(res.res.status).toBe(401);
            isError(res.json);
        });

        it('should deny environment API keys', async () => {
            const { apiKey } = await seedAccount();

            const res = await api.fetch('/environments', {
                method: 'POST',
                token: apiKey.secret,
                body: { name: 'not-from-an-environment-key' }
            });

            expect(res.res.status).toBe(403);
            isError(res.json);
            expect(res.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:create'
            });
        });

        it('should deny Account API keys without the create scope', async () => {
            const { account } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:environments:set_production']);

            const res = await api.fetch('/environments', {
                method: 'POST',
                token: accountKey.secret,
                body: { name: 'not-with-production-scope' }
            });

            expect(res.res.status).toBe(403);
            isError(res.json);
            expect(res.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:create'
            });
        });

        it('should create a non-production environment with the create scope', async () => {
            const { account } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:environments:create']);

            const res = await api.fetch('/environments', {
                method: 'POST',
                token: accountKey.secret,
                body: { name: 'managed-dev' }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data).toStrictEqual({
                id: expect.any(Number),
                uuid: expect.any(String),
                name: 'managed-dev',
                is_production: false,
                callback_url: getGlobalOAuthCallbackUrl(),
                slack_notifications: false,
                otlp_endpoint: null,
                otlp_headers: [],
                webhooks: {
                    primary_url: null,
                    secondary_url: null,
                    on_sync_completion_always: true,
                    on_auth_creation: true,
                    on_auth_refresh_error: true,
                    on_sync_error: true,
                    on_async_action_completion: true,
                    on_connection_deletion: true,
                    signing_key: expect.any(String)
                }
            });
            expect(res.json.data.uuid).toBeUUID();
            expect(res.json.data.webhooks.signing_key).toBeUUID();
            const storedKey = (await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, res.json.data.id)).unwrap();
            expect(res.json.data.webhooks.signing_key).toBe(storedKey);

            const environment = await environmentService.getByIdWithoutSecrets(res.json.data.id, account.id);
            expect(environment).toMatchObject({ account_id: account.id, name: 'managed-dev', is_production: false });
        });

        it('should configure and return public settings with only create permission', async () => {
            const { account, plan } = await seedAccount();
            (await updatePlan(db.knex, { id: plan.id, has_otel: true })).unwrap();
            const accountKey = await createAccountKey(account.id, ['account:environments:create']);
            const webhooks = {
                primary_url: 'https://hooks.example.com/events',
                secondary_url: '',
                on_sync_completion_always: false,
                on_auth_creation: false,
                on_auth_refresh_error: false,
                on_sync_error: false,
                on_async_action_completion: false,
                on_connection_deletion: false
            };
            const settings = {
                name: 'full-settings',
                is_production: false,
                callback_url: 'https://app.example.com/oauth/callback',
                slack_notifications: true,
                otlp_endpoint: 'https://otel.example.com',
                otlp_headers: [
                    { name: 'Authorization', value: 'Bearer first-token' },
                    { name: 'Authorization', value: 'Bearer final-token' }
                ],
                webhooks
            };

            const hmacSettings = {
                hmac_key: 'supplied-hmac-key',
                hmac_enabled: true
            };

            const res = await api.fetch('/environments', { method: 'POST', token: accountKey.secret, body: { ...settings, ...hmacSettings } });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data).toStrictEqual({
                ...settings,
                id: expect.any(Number),
                uuid: expect.any(String),
                otlp_headers: [{ name: 'Authorization', value: 'Bearer final-token' }],
                webhooks: { ...webhooks, signing_key: expect.any(String) }
            });
        });

        it.each([
            null,
            { secondary_url: 'invalid-url' },
            { primary_url: 'https://nango.dev/webhooks' },
            { signing_key: uuidV7() },
            { on_sync_error: 'true' },
            { unexpected: true }
        ])('should reject invalid webhook configuration %j before creation', async (webhooks) => {
            const { account } = await seedAccount();
            const key = await createAccountKey(account.id, ['account:environments:create']);
            const res = await api.fetch('/environments', {
                method: 'POST',
                token: key.secret,
                // @ts-expect-error deliberately invalid input
                body: { name: 'invalid-webhooks', webhooks }
            });

            expect(res.res.status).toBe(400);
            isError(res.json);
            expect(res.json.error.code).toBe('invalid_body');
            await expect(db.knex('_nango_environments').where({ account_id: account.id, name: 'invalid-webhooks' })).resolves.toEqual([]);
        });

        it('should only allow otlp settings for entitled plans', async () => {
            const { account, plan } = await seedAccount();
            const key = await createAccountKey(account.id, ['account:environments:create']);
            const settings = { name: 'headers-only', otlp_headers: [{ name: 'Authorization', value: 'Bearer token' }] };
            (await updatePlan(db.knex, { id: plan.id, has_otel: false })).unwrap();
            const denied = await api.fetch('/environments', { method: 'POST', token: key.secret, body: settings });
            expect(denied.res.status).toBe(403);

            (await updatePlan(db.knex, { id: plan.id, has_otel: true })).unwrap();
            const created = await api.fetch('/environments', { method: 'POST', token: key.secret, body: settings });
            expect(created.res.status).toBe(200);
            isSuccess(created.json);
            expect(created.json.data.otlp_endpoint).toBe('');
            expect(created.json.data.otlp_headers).toStrictEqual(settings.otlp_headers);
        });

        it('should enforce the environment limit from the account plan', async () => {
            const { account, plan } = await seedAccount();
            const key = await createAccountKey(account.id, ['account:environments:create']);
            (await updatePlan(db.knex, { id: plan.id, environments_max: 1 })).unwrap();

            const res = await api.fetch('/environments', { method: 'POST', token: key.secret, body: { name: 'over-limit' } });

            expect(res.res.status).toBe(400);
            expect(res.json).toStrictEqual({ error: { code: 'resource_capped', message: 'Maximum number of environments reached' } });
            await expect(db.knex('_nango_environments').where({ account_id: account.id, name: 'over-limit' })).resolves.toEqual([]);
        });

        it('should return a generic error when environment creation fails', async () => {
            const { account } = await seedAccount();
            const key = await createAccountKey(account.id, ['account:environments:create']);
            vi.spyOn(externalWebhookService, 'upsert').mockResolvedValueOnce(Err(new Error('sensitive database error')));

            const res = await api.fetch('/environments', { method: 'POST', token: key.secret, body: { name: 'failed-creation' } });

            expect(res.res.status).toBe(500);
            expect(res.json).toStrictEqual({ error: { code: 'server_error', message: 'Failed to create environment' } });
        });

        it('should require set_production in addition to create for production environments', async () => {
            const { account } = await seedAccount();
            const createKey = await createAccountKey(account.id, ['account:environments:create']);

            const deniedFlag = await api.fetch('/environments', {
                method: 'POST',
                token: createKey.secret,
                body: { name: 'production-staging', is_production: true }
            });

            expect(deniedFlag.res.status).toBe(403);
            isError(deniedFlag.json);
            expect(deniedFlag.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:set_production'
            });

            const deniedReservedName = await api.fetch('/environments', {
                method: 'POST',
                token: createKey.secret,
                body: { name: PROD_ENVIRONMENT_NAME }
            });

            expect(deniedReservedName.res.status).toBe(403);
            isError(deniedReservedName.json);
            expect(deniedReservedName.json.error).toEqual({
                code: 'forbidden',
                message: 'Insufficient scope. Required: account:environments:set_production'
            });

            const productionKey = await createAccountKey(account.id, ['account:environments:create', 'account:environments:set_production']);
            const created = await api.fetch('/environments', {
                method: 'POST',
                token: productionKey.secret,
                body: { name: PROD_ENVIRONMENT_NAME }
            });

            expect(created.res.status).toBe(200);
            isSuccess(created.json);
            const environment = await environmentService.getByIdWithoutSecrets(created.json.data.id, account.id);
            expect(environment).toMatchObject({ name: PROD_ENVIRONMENT_NAME, is_production: true });
        });
    });

    describe('DELETE /environments/:environmentUuid', () => {
        it('should be protected', async () => {
            const res = await api.fetch('/environments/:environmentUuid', {
                method: 'DELETE',
                params: { environmentUuid: '123e4567-e89b-12d3-a456-426614174000' }
            });

            shouldBeProtected(res);
        });

        it('should keep create and delete scopes independent', async () => {
            const { account } = await seedAccount();
            const environment = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: 'scope-boundary' })).unwrap().environment;
            const createKey = await createAccountKey(account.id, ['account:environments:create']);
            const deleteKey = await createAccountKey(account.id, ['account:environments:delete']);

            const deniedDelete = await api.fetch('/environments/:environmentUuid', {
                method: 'DELETE',
                token: createKey.secret,
                params: { environmentUuid: environment.uuid }
            });
            expect(deniedDelete.res.status).toBe(403);

            const deniedCreate = await api.fetch('/environments', {
                method: 'POST',
                token: deleteKey.secret,
                body: { name: 'not-with-delete-scope' }
            });
            expect(deniedCreate.res.status).toBe(403);

            const deleted = await api.fetch('/environments/:environmentUuid', {
                method: 'DELETE',
                token: deleteKey.secret,
                params: { environmentUuid: environment.uuid }
            });
            expect(deleted.res.status).toBe(204);
            expect(await environmentService.getById(environment.id)).toBeNull();
        });

        it('should not reveal or delete an environment from another account', async () => {
            const first = await seedAccount();
            const second = await seedAccount();
            const deleteKey = await createAccountKey(first.account.id, ['account:environments:delete']);

            const res = await api.fetch('/environments/:environmentUuid', {
                method: 'DELETE',
                token: deleteKey.secret,
                params: { environmentUuid: second.env.uuid }
            });

            expect(res.res.status).toBe(404);
            isError(res.json);
            expect(res.json.error).toEqual({ code: 'not_found', message: 'Environment not found' });
            expect(await environmentService.getById(second.env.id)).not.toBeNull();
        });

        it('should refuse to delete the protected production environment', async () => {
            const { account } = await seedAccount();
            const production = (
                await environmentService.createEnvironment(db.knex, {
                    accountId: account.id,
                    name: PROD_ENVIRONMENT_NAME
                })
            ).unwrap().environment;
            const deleteKey = await createAccountKey(account.id, ['account:environments:delete']);

            const res = await api.fetch('/environments/:environmentUuid', {
                method: 'DELETE',
                token: deleteKey.secret,
                params: { environmentUuid: production.uuid }
            });

            expect(res.res.status).toBe(400);
            isError(res.json);
            expect(res.json.error).toEqual({
                code: 'cannot_delete_prod_environment',
                message: 'Cannot delete prod environment'
            });
        });

        it('should allow account:* to create and delete environments', async () => {
            const { account } = await seedAccount();
            const accountKey = await createAccountKey(account.id, ['account:*']);

            const created = await api.fetch('/environments', {
                method: 'POST',
                token: accountKey.secret,
                body: { name: 'full-account-access' }
            });
            expect(created.res.status).toBe(200);
            isSuccess(created.json);

            const deleted = await api.fetch('/environments/:environmentUuid', {
                method: 'DELETE',
                token: accountKey.secret,
                params: { environmentUuid: created.json.data.uuid }
            });
            expect(deleted.res.status).toBe(204);
        });
    });
});
