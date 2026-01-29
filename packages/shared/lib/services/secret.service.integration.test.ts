import { v4 as uuid } from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import environmentService from './environment.service.js';
import secretService from './secret.service.js';
import { createAccount } from '../seeders/account.seeder.js';

import type { DBEnvironment } from '@nangohq/types';

describe('Secret service', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    const newEnv = async (): Promise<DBEnvironment> => {
        const account = await createAccount();
        const env = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() }))!;
        return env;
    };

    it('creates a default secret for each environment', async () => {
        const env = await newEnv();
        // Note: getDefaultSecretForEnv will throw if no default secret exists.
        await expect(secretService.getDefaultSecretForEnv(db.knex, env.id)).resolves.not.toThrow();
    });

    it('refuses to create two default secrets', async () => {
        const env = await newEnv();
        await expect(
            secretService.createSecret(db.knex, {
                environmentId: env.id,
                isDefault: true
            })
        ).rejects.toThrow();
    });

    it('can create multiple non-default secrets', async () => {
        const env = await newEnv();
        for (let i = 0; i < 8; i++) {
            await expect(
                secretService.createSecret(db.knex, {
                    environmentId: env.id,
                    isDefault: false
                })
            ).resolves.not.toThrow();
        }
    });

    it('can mark a non-default as default', async () => {
        const env = await newEnv();
        const secret = (
            await secretService.createSecret(db.knex, {
                environmentId: env.id,
                isDefault: false
            })
        ).unwrap();
        await expect(secretService.markDefault(db.knex, secret.id)).resolves.not.toThrow();
        const newDefault = (await secretService.getDefaultSecretForEnv(db.knex, env.id)).unwrap();
        expect(newDefault.id).toEqual(secret.id);
    });

    it('marks default secrets idempotently', async () => {
        const env = await newEnv();
        const secret = (
            await secretService.createSecret(db.knex, {
                environmentId: env.id,
                isDefault: false
            })
        ).unwrap();
        for (let i = 0; i < 8; i++) {
            await expect(secretService.markDefault(db.knex, secret.id)).resolves.not.toThrow();
        }
    });

    it('fetches all secrets for an environment', async () => {
        const env = await newEnv();
        for (let i = 0; i < 8; i++) {
            await secretService.createSecret(db.knex, {
                environmentId: env.id,
                isDefault: false
            });
        }
        const allSecrets = (await secretService.getAllSecretsForEnv(db.knex, env.id)).unwrap();
        expect(allSecrets.length).toBe(9); // 1 default + 8 non-defaults.
    });

    it('fetches default secrets for all given environments', async () => {
        const envs = [await newEnv(), await newEnv(), await newEnv()];
        const fetched = (
            await secretService.getDefaultSecretsForAllEnvs(
                db.knex,
                envs.map((env) => env.id)
            )
        ).unwrap();
        expect(fetched.size).toBe(envs.length);
        for (const env of envs) {
            expect(fetched.get(env.id)).toBeDefined();
        }
    });
});
