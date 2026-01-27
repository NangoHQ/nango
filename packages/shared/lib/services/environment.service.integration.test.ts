import { v4 as uuid } from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import environmentService from './environment.service.js';
import secretService from './secret.service.js';
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
            // Deprecated fields:
            deprecated_pending_secret_key: null,
            deprecated_pending_secret_key_iv: null,
            deprecated_pending_secret_key_tag: null,
            deprecated_secret_key: expect.any(String),
            deprecated_secret_key_hashed: null,
            deprecated_secret_key_iv: null,
            deprecated_secret_key_tag: null
        });

        expect(env.secret_key).toBeUUID();
    });

    it('should rotate secretKey', async () => {
        const account = await createAccount();
        const env = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() }))!;
        expect(env.secret_key).toBeUUID();
        expect(env.pending_secret_key).toBeNull();

        const secret = await secretService.getDefaultSecretForEnv(db.knex, env.id);
        expect(secret.is_default).toBe(true);
        expect(secret.secret).toEqual(env.secret_key);

        // Rotate
        await environmentService.rotateSecretKey(env.id);

        const env2 = (await environmentService.getById(env.id))!;
        expect(env2.secret_key).toEqual(env.secret_key);
        expect(env2.pending_secret_key).toBeUUID();

        const secret2 = await secretService.getDefaultSecretForEnv(db.knex, env.id);
        expect(secret2).toEqual(secret);

        // Activate
        await environmentService.activateSecretKey(env.id);

        const env3 = (await environmentService.getById(env.id))!;
        expect(env3.secret_key).toBeUUID();
        expect(env3.pending_secret_key).toBeNull();

        const secret3 = await secretService.getDefaultSecretForEnv(db.knex, env.id);
        expect(secret3).not.toEqual(secret2);
        expect(secret3.is_default).toBe(true);
        expect(secret3.secret).toEqual(env3.secret_key);
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
