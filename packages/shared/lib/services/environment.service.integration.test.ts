import { v4 as uuid } from 'uuid';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { Err } from '@nangohq/utils';

import { externalWebhookService } from '../index.js';
import { createAccount } from '../seeders/account.seeder.js';
import { createEnvironmentSeed } from '../seeders/environment.seeder.js';
import { getEncryptionManager } from '../utils/encryption.manager.js';
import customerKeyService from './customerKey.service.js';
import environmentService from './environment.service.js';

import type { Orchestrator } from '../clients/orchestrator.js';
import type { CreateEnvironmentSettings, UpdateEnvironmentSettings } from './environment.service.js';
import type { DBCustomerKey, DBEnvironment } from '@nangohq/types';

describe('Environment service', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should create a service with secrets', async () => {
        const account = await createAccount();
        const envName = uuid();
        const env = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: envName })).unwrap().environment;

        expect(env).toStrictEqual({
            account_id: account.id,
            always_send_webhook: false,
            callback_url: null,
            created_at: expect.toBeIsoDate(),
            hmac_enabled: false,
            hmac_key: null,
            id: expect.any(Number),
            is_production: false,
            name: envName,
            pending_public_key: null,
            pending_secret_key: null,
            public_key: expect.any(String),
            secret_key: expect.any(String),
            send_auth_webhook: false,
            slack_notifications: false,
            updated_at: expect.toBeIsoDate(),
            uuid: expect.any(String),
            webhook_url: null,
            webhook_url_secondary: null,
            otlp_settings: null,
            deleted: false,
            deleted_at: null,
            pending_secret_key_iv: null,
            pending_secret_key_tag: null,
            secret_key_hashed: null,
            secret_key_iv: null,
            secret_key_tag: null
        });

        expect(env.secret_key).toBeUUID();
    });

    it('should set is_production = true when name is prod', async () => {
        const account = await createAccount();
        const env = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: 'prod' })).unwrap().environment;
        expect(env.is_production).toBe(true);
    });

    it('should set is_production = false by default when name is not prod', async () => {
        const account = await createAccount();
        const env = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: 'dev' })).unwrap().environment;
        expect(env.is_production).toBe(false);
    });

    it('should create default external webhook settings', async () => {
        const account = await createAccount();
        const env = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() })).unwrap().environment;

        await expect(externalWebhookService.get(env.id)).resolves.toMatchObject({
            environment_id: env.id,
            on_auth_creation: true,
            on_auth_refresh_error: true,
            on_sync_completion_always: true,
            on_sync_error: true,
            on_async_action_completion: true,
            on_connection_deletion: true
        });
    });

    it('should return the persisted webhook settings and initial signing key', async () => {
        const account = await createAccount();
        const created = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() })).unwrap();

        expect(created.webhooks).toStrictEqual(await externalWebhookService.get(created.environment.id));
        expect(created.webhooks).toMatchObject({
            environment_id: created.environment.id,
            primary_url: null,
            secondary_url: null,
            on_auth_creation: true,
            on_auth_refresh_error: true,
            on_sync_completion_always: true,
            on_sync_error: true,
            on_async_action_completion: true,
            on_connection_deletion: true
        });
        expect(created.webhookSigningKey).toBeUUID();
        const storedKey = (await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, created.environment.id)).unwrap();
        expect(created.webhookSigningKey).toBe(storedKey);
    });

    it.each(['8A27FE09-327C-43EC-8F75-B1F212904F45', '01932D5E-7B5C-7E27-9D62-1BD0F0A21C8F'])(
        'should encrypt and preserve the supplied signing UUID %s',
        async (webhookSigningKey) => {
            const account = await createAccount();
            const created = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid(), webhookSigningKey })).unwrap();

            expect(created.webhookSigningKey).toBe(webhookSigningKey);

            const storedKey = await db
                .knex<DBCustomerKey>('customer_keys')
                .select('customer_keys.*')
                .join('customer_keys_relations', 'customer_keys_relations.customer_key_id', 'customer_keys.id')
                .where('customer_keys.key_type', 'webhook_signing')
                .where('customer_keys.account_id', account.id)
                .where('customer_keys_relations.entity_type', 'environment')
                .where('customer_keys_relations.entity_id', created.environment.id)
                .first<DBCustomerKey | undefined>();
            if (!storedKey) {
                throw new Error('Expected a persisted webhook signing key linked to the environment');
            }

            expect(storedKey.secret).not.toBe(webhookSigningKey);
            expect(storedKey.iv).toBeTruthy();
            expect(storedKey.tag).toBeTruthy();
            expect(storedKey.hashed).toBeTruthy();
            expect(storedKey.hashed).not.toBe(webhookSigningKey);
            expect(getEncryptionManager().decryptAPISecret(storedKey).secret).toBe(webhookSigningKey);
        }
    );

    describe('supplied signing key reuse', () => {
        it('should allow the same signing key on several environments of an account', async () => {
            const account = await createAccount();
            const webhookSigningKey = uuid();

            const first = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid(), webhookSigningKey })).unwrap();
            const second = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid(), webhookSigningKey })).unwrap();

            expect((await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, first.environment.id)).unwrap()).toBe(webhookSigningKey);
            expect((await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, second.environment.id)).unwrap()).toBe(webhookSigningKey);
        });

        it('should allow reusing the signing key of a soft deleted environment', async () => {
            const account = await createAccount();
            const webhookSigningKey = uuid();

            const deleted = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid(), webhookSigningKey })).unwrap();
            await environmentService.softDelete({ environmentId: deleted.environment.id, orchestrator: {} as Orchestrator });

            const deletedEnvironment = await db.knex<DBEnvironment>('_nango_environments').where({ id: deleted.environment.id }).first();
            expect(deletedEnvironment).toMatchObject({ deleted: true, deleted_at: expect.toBeIsoDate() });

            const created = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid(), webhookSigningKey })).unwrap();

            expect((await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, created.environment.id)).unwrap()).toBe(webhookSigningKey);
        });

        it('should only rotate the key of the targeted environment', async () => {
            const account = await createAccount();
            const webhookSigningKey = uuid();

            const rotated = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid(), webhookSigningKey })).unwrap();
            const untouched = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid(), webhookSigningKey })).unwrap();

            const newKey = (await customerKeyService.rotateWebhookSigningKey(db.knex, rotated.environment.id)).unwrap();
            expect(newKey).not.toBe(webhookSigningKey);

            expect((await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, rotated.environment.id)).unwrap()).toBe(newKey);
            expect((await customerKeyService.getUncachedWebhookSigningKeyForEnv(db.knex, untouched.environment.id)).unwrap()).toBe(webhookSigningKey);
        });
    });

    it('should persist custom webhook URLs and disabled subscriptions', async () => {
        const account = await createAccount();
        const webhooks = {
            primary_url: 'https://example.com/webhooks',
            secondary_url: 'https://backup.example.com/webhooks',
            on_auth_creation: false,
            on_auth_refresh_error: false,
            on_sync_completion_always: false,
            on_sync_error: false,
            on_async_action_completion: false,
            on_connection_deletion: false
        };
        const created = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid(), webhooks })).unwrap();

        expect(created.webhooks).toMatchObject(webhooks);
        await expect(externalWebhookService.get(created.environment.id)).resolves.toStrictEqual(created.webhooks);
    });

    it('should ignore invalid fields in supplied webhook settings', async () => {
        const account = await createAccount();
        const existing = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() })).unwrap();
        const webhooks = {
            primary_url: 'https://example.com/webhook',
            on_sync_error: false,
            id: -1,
            environment_id: existing.environment.id,
            created_at: new Date('2000-01-01'),
            updated_at: new Date('2000-01-01'),
            unexpected_column: 'ignored'
        };

        const created = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid(), webhooks })).unwrap();

        expect(created.webhooks).toMatchObject({
            environment_id: created.environment.id,
            primary_url: webhooks.primary_url,
            on_sync_error: false
        });
        expect(created.webhooks.id).not.toBe(webhooks.id);
        expect(created.webhooks.created_at).not.toEqual(webhooks.created_at);
        expect(created.webhooks.updated_at).not.toEqual(webhooks.updated_at);
        expect(created.webhooks).not.toHaveProperty('unexpected_column');
        await expect(externalWebhookService.get(existing.environment.id)).resolves.toStrictEqual(existing.webhooks);
        await expect(externalWebhookService.get(created.environment.id)).resolves.toStrictEqual(created.webhooks);
    });

    it('should preserve defaults for unset webhook settings', async () => {
        const account = await createAccount();
        const created = (
            await environmentService.createEnvironment(db.knex, {
                accountId: account.id,
                name: uuid(),
                webhooks: { primary_url: '', on_sync_error: false }
            })
        ).unwrap();

        expect(created.webhooks).toMatchObject({
            primary_url: '',
            secondary_url: null,
            on_auth_creation: true,
            on_auth_refresh_error: true,
            on_sync_completion_always: true,
            on_sync_error: false,
            on_async_action_completion: true,
            on_connection_deletion: true
        });
    });

    it.each(['signing key', 'webhook configuration'])('should roll back all creation writes when %s creation fails', async (stage) => {
        const account = await createAccount();
        const name = uuid();
        const webhookSigningKey = uuid();
        const expectedFailure = new Error(`Failed to create ${stage}`);

        const createSigningKey = customerKeyService.createWebhookSigningKey.bind(customerKeyService);
        const signingKeySpy = vi.spyOn(customerKeyService, 'createWebhookSigningKey').mockImplementationOnce(async (trx, options) => {
            const created = await createSigningKey(trx, options);
            expect(created.isOk()).toBe(true);
            return stage === 'signing key' ? Err(expectedFailure) : created;
        });

        const upsertWebhooks = externalWebhookService.upsert;
        const webhookSpy = vi.spyOn(externalWebhookService, 'upsert').mockImplementationOnce(async (trx, options) => {
            const updated = await upsertWebhooks(trx, options);
            expect(updated.isOk()).toBe(true);
            return stage === 'webhook configuration' ? Err(expectedFailure) : updated;
        });

        const result = await environmentService.createEnvironment(db.knex, { accountId: account.id, name, webhookSigningKey });
        if (result.isOk()) {
            throw new Error('Expected environment creation to fail');
        }

        expect(result.isErr()).toBe(true);
        expect(result.error.code).toBe('creation_failed');
        expect(result.error.cause).toBe(expectedFailure);

        expect(signingKeySpy).toHaveBeenCalledOnce();
        expect(signingKeySpy.mock.calls[0]?.[1].secret).toBe(webhookSigningKey);

        const environmentId = signingKeySpy.mock.calls[0]?.[1].environmentId;
        expect(environmentId).toBeDefined();

        if (stage === 'webhook configuration') {
            expect(webhookSpy).toHaveBeenCalledOnce();
            expect(environmentId).toEqual(webhookSpy.mock.calls[0]?.[1].environment_id);
        } else {
            expect(webhookSpy).not.toHaveBeenCalled();
        }

        // no artifacts should've been created out of a failed environment creation
        await expect(db.knex('_nango_environments').where({ account_id: account.id, name })).resolves.toEqual([]);
        await expect(db.knex('api_secrets').where({ environment_id: environmentId })).resolves.toEqual([]);
        await expect(db.knex('customer_keys').where({ account_id: account.id })).resolves.toEqual([]);
        await expect(db.knex('customer_keys_relations').where({ entity_type: 'environment', entity_id: environmentId })).resolves.toEqual([]);
        await expect(db.knex('_nango_external_webhooks').where({ environment_id: environmentId })).resolves.toEqual([]);
    });

    it('should return an error when a webhook upsert fails in the database', async () => {
        const result = await externalWebhookService.upsert(db.knex, { environment_id: -1, data: { primary_url: 'https://example.com/webhook' } });

        expect(result.isErr()).toBe(true);
        await expect(externalWebhookService.get(-1)).resolves.toBeNull();
    });

    it('should reject creating environment named prod as a non-production environment', async () => {
        const account = await createAccount();
        const result = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: 'prod', isProduction: false });
        expect(result).toSatisfy((value) => value.isErr() && value.error.code === 'invalid_is_prod_flag');
    });

    it('should reject duplicate environment names', async () => {
        const account = await createAccount();
        const name = uuid();
        await environmentService.createEnvironment(db.knex, { accountId: account.id, name });

        const result = await environmentService.createEnvironment(db.knex, { accountId: account.id, name });

        expect(result).toSatisfy((value) => value.isErr() && value.error.code === 'conflict');
    });

    it('should persist optional environment settings during creation', async () => {
        const account = await createAccount();
        const env = (
            await environmentService.createEnvironment(db.knex, {
                accountId: account.id,
                name: uuid(),
                isProduction: true,
                callbackUrl: 'https://example.com/callback',
                hmacKey: 'hmac-key',
                hmacEnabled: true,
                slackNotifications: true,
                otlpSettings: { endpoint: 'https://otel.example.com', headers: { Authorization: 'Bearer token' } }
            })
        ).unwrap().environment;

        expect(env).toMatchObject({
            is_production: true,
            callback_url: 'https://example.com/callback',
            hmac_key: 'hmac-key',
            hmac_enabled: true,
            slack_notifications: true,
            otlp_settings: { endpoint: 'https://otel.example.com', headers: { Authorization: 'Bearer token' } }
        });
    });

    describe('updateEnvironment', () => {
        async function seedUpdate(settings: Partial<CreateEnvironmentSettings> = {}) {
            const account = await createAccount();
            const { environment } = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid(), ...settings })).unwrap();
            const update = (data: Partial<UpdateEnvironmentSettings>) =>
                environmentService.updateEnvironment(db.knex, { accountId: account.id, environmentUuid: environment.uuid, ...data });
            const read = () => environmentService.getByIdWithoutSecrets(environment.id);
            return { environment, update, read };
        }

        it('updates supplied fields and returns the persisted environment', async () => {
            const { environment, update, read } = await seedUpdate({ slackNotifications: true });
            const updated = (await update({ callbackUrl: 'https://example.com/callback', slackNotifications: false })).unwrap();
            expect(updated).toMatchObject({ name: environment.name, callback_url: 'https://example.com/callback', slack_notifications: false });
            expect(await read()).toEqual(updated);
        });

        it('returns the existing environment when no fields are supplied', async () => {
            const { update, read } = await seedUpdate();
            const before = await read();
            expect((await update({})).unwrap()).toEqual(before);
            expect(await read()).toEqual(before);
        });

        const initialOtlp = { endpoint: 'https://example.com/old', headers: { Authorization: 'old-token', Other: 'keep' } };
        it.each([
            {
                name: 'updates the OTLP endpoint and preserves headers',
                initial: initialOtlp,
                settings: { otlpSettings: { endpoint: 'https://example.com/new' } },
                expected: { ...initialOtlp, endpoint: 'https://example.com/new' }
            },
            {
                name: 'replaces OTLP headers and preserves the endpoint',
                initial: initialOtlp,
                settings: { otlpSettings: { headers: { Authorization: 'new-token' } } },
                expected: { ...initialOtlp, headers: { Authorization: 'new-token' } }
            },
            { name: 'clears OTLP headers', initial: initialOtlp, settings: { otlpSettings: { headers: {} } }, expected: { ...initialOtlp, headers: {} } },
            { name: 'preserves omitted OTLP settings', initial: initialOtlp, settings: { slackNotifications: false }, expected: initialOtlp },
            { name: 'clears OTLP settings with null', initial: initialOtlp, settings: { otlpSettings: null }, expected: null },
            {
                name: 'defaults headers when initializing OTLP with an endpoint',
                initial: null,
                settings: { otlpSettings: { endpoint: 'https://example.com/new' } },
                expected: { endpoint: 'https://example.com/new', headers: {} }
            },
            {
                name: 'defaults the endpoint when initializing OTLP with headers',
                initial: null,
                settings: { otlpSettings: { headers: {} } },
                expected: { endpoint: '', headers: {} }
            },
            { name: 'clears the OTLP endpoint', initial: initialOtlp, settings: { otlpSettings: { endpoint: '' } }, expected: { ...initialOtlp, endpoint: '' } }
        ])('$name', async ({ initial, settings, expected }) => {
            const { update, read } = await seedUpdate({ otlpSettings: initial });
            (await update(settings)).unwrap();
            expect((await read())?.otlp_settings).toEqual(expected);
        });

        it('preserves concurrent endpoint and header updates after both requests read the environment', async () => {
            const { environment, update, read } = await seedUpdate({
                otlpSettings: { endpoint: 'https://example.com/old', headers: { Old: 'old-token' } }
            });
            // Hold the normal UPDATE lock so both service requests read before either can write.
            const blocker = await db.knex.transaction();
            await blocker<DBEnvironment>('_nango_environments').where({ id: environment.id }).update({ slack_notifications: false });
            let writers = 0;
            const trackWrite = (query: { sql: string }) => {
                if (query.sql.startsWith('update "_nango_environments"')) {
                    writers++;
                }
            };
            db.knex.on('query', trackWrite);
            const results = Promise.all([
                update({ otlpSettings: { endpoint: 'https://example.com/new' } }),
                update({ otlpSettings: { headers: { Authorization: 'new-token' } } })
            ]);
            try {
                // Both reads must finish before either update; no explicit row lock should serialize them.
                await vi.waitFor(() => expect(writers).toBe(2));
            } finally {
                db.knex.off('query', trackWrite);
                await blocker.rollback();
                for (const result of await results) {
                    result.unwrap();
                }
            }
            expect((await read())?.otlp_settings).toEqual({
                endpoint: 'https://example.com/new',
                headers: { Authorization: 'new-token' }
            });
        });

        it('returns a conflict for a name already in use', async () => {
            const { environment, update } = await seedUpdate();
            const other = await createEnvironmentSeed(environment.account_id);
            const result = await update({ name: other.name });
            expect(result.isErr() && result.error.code).toBe('conflict');
        });

        it.each(['another account', 'missing'] as const)('returns not_found for an environment that is %s', async (target) => {
            const { update } = await seedUpdate();
            const settings = target === 'missing' ? { environmentUuid: uuid() } : { accountId: (await createAccount()).id };
            const result = await update({ ...settings, callbackUrl: 'https://example.com/callback' });
            expect(result.isErr() && result.error.code).toBe('not_found');
        });
    });

    describe('environment variables', () => {
        it('should store and retrieve environment variables', async () => {
            const account = await createAccount();
            const env = await createEnvironmentSeed(account.id, uuid());

            const variables = [
                { name: 'TEST_VAR', value: 'test_value' },
                { name: 'ANOTHER_VAR', value: 'another_value' }
            ];

            await environmentService.editEnvironmentVariable(env.id, variables);

            const retrieved = await environmentService.getEnvironmentVariables(env.id);
            expect(retrieved).toHaveLength(2);
            expect(retrieved.map((v) => ({ name: v.name, value: v.value }))).toEqual(expect.arrayContaining(variables));
        });
    });
});
