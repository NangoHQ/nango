import { v4 as uuid } from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { externalWebhookService } from '../index.js';
import { createAccount } from '../seeders/account.seeder.js';
import { createEnvironmentSeed } from '../seeders/environment.seeder.js';
import environmentService from './environment.service.js';

describe('Environment service', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('should create a service with secrets', async () => {
        const account = await createAccount();
        const envName = uuid();
        const env = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: envName })).unwrap();

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
        const env = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: 'prod' })).unwrap();
        expect(env.is_production).toBe(true);
    });

    it('should set is_production = false by default when name is not prod', async () => {
        const account = await createAccount();
        const env = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: 'dev' })).unwrap();
        expect(env.is_production).toBe(false);
    });

    it('should create default external webhook settings', async () => {
        const account = await createAccount();
        const env = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() })).unwrap();

        await expect(externalWebhookService.get(env.id)).resolves.toMatchObject({
            environment_id: env.id,
            on_auth_creation: true,
            on_auth_refresh_error: true,
            on_sync_completion_always: true,
            on_sync_error: true,
            on_connection_deletion: true
        });
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
        ).unwrap();

        expect(env).toMatchObject({
            is_production: true,
            callback_url: 'https://example.com/callback',
            hmac_key: 'hmac-key',
            hmac_enabled: true,
            slack_notifications: true,
            otlp_settings: { endpoint: 'https://otel.example.com', headers: { Authorization: 'Bearer token' } }
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
