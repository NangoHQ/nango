import { v4 as uuid } from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import environmentService from './environment.service.js';
import { createAccount } from '../seeders/account.seeder.js';
import { createEnvironmentSeed } from '../seeders/environment.seeder.js';

describe('Environment service', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('should create a service with secrets', async () => {
        const account = await createAccount();
        const envName = uuid();
        const env = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: envName });
        if (!env) {
            throw new Error('failed_to_create_env');
        }

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
        const env = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: 'prod' });
        expect(env).not.toBeNull();
        expect(env!.is_production).toBe(true);
    });

    it('should set is_production = false for non-prod environments', async () => {
        const account = await createAccount();
        const env = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: 'dev' });
        expect(env).not.toBeNull();
        expect(env!.is_production).toBe(false);
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
