import { expect, describe, it, beforeAll } from 'vitest';
import environmentService from './environment.service.js';
import { v4 as uuid } from 'uuid';
import { multipleMigrations } from '../db/database.js';
import { createAccount } from '../db/seeders/account.seeder.js';

describe('Environment service', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('should create a service with secrets', async () => {
        const account = await createAccount();
        const envName = uuid();
        const env = await environmentService.createEnvironment(account.id, envName);
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
            pending_secret_key_iv: null,
            pending_secret_key_tag: null,
            public_key: expect.any(String),
            secret_key: expect.any(String),
            secret_key_hashed: expect.any(String),
            secret_key_iv: null,
            secret_key_tag: null,
            send_auth_webhook: false,
            slack_notifications: false,
            updated_at: expect.toBeIsoDate(),
            uuid: expect.any(String),
            webhook_url: null
        });
        // In non-encrypted env both should equal
        expect(env.secret_key).toEqual(env.secret_key_hashed);
    });

    it('should retrieve env by secretKey', async () => {
        const account = await createAccount();
        const env = await environmentService.createEnvironment(account.id, uuid());

        const get = await environmentService.getAccountIdAndEnvironmentIdBySecretKey(env!.secret_key);

        expect(get).toStrictEqual({
            accountId: account.id,
            environmentId: env!.id
        });
    });

    it('should rotate secretKey', async () => {
        const account = await createAccount();
        const env = (await environmentService.createEnvironment(account.id, uuid()))!;

        // Rotate
        await environmentService.rotateSecretKey(env.id);

        const env2 = (await environmentService.getById(env.id))!;
        expect(env2.pending_secret_key).not.toBeNull();
        expect(env2.pending_secret_key).not.toEqual(env2.secret_key);
        expect(env2.secret_key_hashed).toEqual(env.secret_key);

        // Activate
        await environmentService.activateSecretKey(env.id);

        const env3 = (await environmentService.getById(env.id))!;
        expect(env3.pending_secret_key).toBeNull();
        expect(env3.secret_key).toEqual(env2.pending_secret_key);
        expect(env3.secret_key_hashed).toEqual(env2.pending_secret_key);
    });
});
