import { v4 as uuid } from 'uuid';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import accountService from './account.service.js';
import environmentService, { defaultEnvironments } from './environment.service.js';
import * as plans from './plans/plans.js';
import secretService from './secret.service.js';
import { createAccount as createTestAccount } from '../seeders/account.seeder.js';

describe('Account service', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should create an account with default environments and a free plan', async () => {
        const accountName = uuid();
        const account = await accountService.createAccount({ name: accountName });
        expect(account).toBeDefined();
        expect(account!.name).toBe(`${accountName}'s Team`);

        const environments = await environmentService.getEnvironmentsByAccountId(account!.id);
        expect(environments).toHaveLength(defaultEnvironments.length);

        const plan = await db.knex.select('*').from('plans').where({ account_id: account!.id }).first();
        expect(plan).toBeDefined();
        expect(plan.name).toBe('free');
    });

    it('should rollback the transaction if creating the plan fails', async () => {
        vi.spyOn(plans, 'createPlan').mockRejectedValueOnce(new Error('PLAN_CREATION_FAILED'));

        const accountName = uuid();
        const teamName = `${accountName}'s Team`;

        await expect(accountService.createAccount({ name: accountName })).rejects.toThrow('PLAN_CREATION_FAILED');

        const account = await db.knex.select('*').from('_nango_accounts').where({ name: teamName }).first();
        expect(account).toBeUndefined();
    });

    it('should retrieve account context by secretKey', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        const plan = (await plans.createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();
        const secret = (await secretService.getInternalSecretForEnv(db.knex, environment!.id)).unwrap();

        const bySecretKey = await accountService.getAccountContext({ secretKey: environment!.secret_key });

        expect(bySecretKey).toStrictEqual({
            account: {
                ...account,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            environment: {
                ...environment,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            plan: {
                ...plan,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            secret: {
                ...secret,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            auth: {
                source: 'customer_key',
                scopes: ['environment:*'],
                apiKeyId: expect.any(Number)
            }
        });
    });

    it('should retrieve account context by legacy secretKey when customer key is missing', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        const plan = (await plans.createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();
        const secret = (await secretService.getInternalSecretForEnv(db.knex, environment!.id)).unwrap();

        await db.knex('customer_keys_relations').where({ entity_type: 'environment', entity_id: environment!.id }).delete();
        await db.knex('customer_keys').where({ account_id: account.id, key_type: 'api' }).delete();

        const bySecretKey = await accountService.getAccountContext({ secretKey: environment!.secret_key });

        expect(bySecretKey).toStrictEqual({
            account: {
                ...account,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            environment: {
                ...environment,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            plan: {
                ...plan,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            secret: {
                ...secret,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            auth: {
                source: 'api_secret',
                scopes: ['environment:*']
            }
        });
    });

    it('should prefer customer key scopes when both tables match the same secret', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        await plans.createPlan(db.knex, { account_id: account.id, name: 'free' });

        await db
            .knex('customer_keys')
            .update({ scopes: ['environment:deploy'] })
            .where({ account_id: account.id, key_type: 'api' })
            .whereNull('deleted_at');

        const bySecretKey = await accountService.getAccountContext({ secretKey: environment!.secret_key });

        expect(bySecretKey?.auth).toStrictEqual({
            source: 'customer_key',
            scopes: ['environment:deploy'],
            apiKeyId: expect.any(Number)
        });
    });

    it('should fall back to legacy secret when matching customer key is soft-deleted', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        await plans.createPlan(db.knex, { account_id: account.id, name: 'free' });

        await db.knex('customer_keys').update({ deleted_at: new Date() }).where({ account_id: account.id, key_type: 'api' });

        const bySecretKey = await accountService.getAccountContext({ secretKey: environment!.secret_key });

        expect(bySecretKey?.auth).toStrictEqual({
            source: 'api_secret',
            scopes: ['environment:*']
        });
    });

    it('should fall back to legacy secret when matching customer key relation is not environment-scoped', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        await plans.createPlan(db.knex, { account_id: account.id, name: 'free' });

        const apiKey = await db.knex('customer_keys').select('id').where({ account_id: account.id, key_type: 'api' }).whereNull('deleted_at').first();

        expect(apiKey).toBeDefined();

        await db.knex('customer_keys_relations').where({ customer_key_id: apiKey!.id }).delete();
        await db.knex('customer_keys_relations').insert({
            customer_key_id: apiKey!.id,
            entity_type: 'account',
            entity_id: account.id
        });

        const bySecretKey = await accountService.getAccountContext({ secretKey: environment!.secret_key });

        expect(bySecretKey?.auth).toStrictEqual({
            source: 'api_secret',
            scopes: ['environment:*']
        });
    });

    it('should return null when secretKey does not match either table', async () => {
        const bySecretKey = await accountService.getAccountContext({ secretKey: uuid() });

        expect(bySecretKey).toBeNull();
    });

    it('should debounce customer key last_used_at updates when resolving by secretKey', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        await plans.createPlan(db.knex, { account_id: account.id, name: 'free' });

        const initial = await accountService.getAccountContext({ secretKey: environment!.secret_key });
        expect(initial?.auth?.source).toBe('customer_key');
        const apiKeyId = initial?.auth?.apiKeyId;
        expect(apiKeyId).toBeDefined();

        const firstLastUsedAt = (await db.knex('customer_keys').select('last_used_at').where({ id: apiKeyId! }).first())?.last_used_at;
        expect(firstLastUsedAt).toBeTruthy();

        const recentTimestamp = new Date(Date.now() - 5 * 1000);
        await db.knex('customer_keys').where({ id: apiKeyId! }).update({ last_used_at: recentTimestamp });

        await accountService.getAccountContext({ secretKey: environment!.secret_key });
        const secondLastUsedAt = (await db.knex('customer_keys').select('last_used_at').where({ id: apiKeyId! }).first())?.last_used_at;
        expect(new Date(secondLastUsedAt).toISOString()).toBe(recentTimestamp.toISOString());

        const staleTimestamp = new Date(Date.now() - 2 * 60 * 1000);
        await db.knex('customer_keys').where({ id: apiKeyId! }).update({ last_used_at: staleTimestamp });

        await accountService.getAccountContext({ secretKey: environment!.secret_key });
        const thirdLastUsedAt = (await db.knex('customer_keys').select('last_used_at').where({ id: apiKeyId! }).first())?.last_used_at;
        expect(new Date(thirdLastUsedAt).getTime()).toBeGreaterThan(staleTimestamp.getTime());
    });

    it('should retrieve account context by publicKey', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        const plan = (await plans.createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();
        const secret = (await secretService.getInternalSecretForEnv(db.knex, environment!.id)).unwrap();

        const byPublicKey = await accountService.getAccountContext({ publicKey: environment!.public_key });

        expect(byPublicKey).toStrictEqual({
            account: {
                ...account,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            environment: {
                ...environment,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            plan: {
                ...plan,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            secret: {
                ...secret,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            }
        });
    });

    it('should retrieve account context by environment uuid', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        const plan = (await plans.createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();
        const secret = (await secretService.getInternalSecretForEnv(db.knex, environment!.id)).unwrap();

        const byUuid = await accountService.getAccountContext({ environmentUuid: environment!.uuid });

        expect(byUuid).toStrictEqual({
            account: {
                ...account,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            environment: {
                ...environment,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            plan: {
                ...plan,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            secret: {
                ...secret,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            }
        });
    });

    it('should retrieve account context by account uuid', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        const plan = (await plans.createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();
        const secret = (await secretService.getInternalSecretForEnv(db.knex, environment!.id)).unwrap();

        const byAccountUuid = await accountService.getAccountContext({ accountUuid: account.uuid, envName: environment!.name });

        expect(byAccountUuid).toStrictEqual({
            account: {
                ...account,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            environment: {
                ...environment,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            plan: {
                ...plan,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            secret: {
                ...secret,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            }
        });
    });

    it('should retrieve account context by accountId and envName', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        const plan = (await plans.createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();
        const secret = (await secretService.getInternalSecretForEnv(db.knex, environment!.id)).unwrap();

        const byAccountId = await accountService.getAccountContext({ accountId: account.id, envName: environment!.name });

        expect(byAccountId).toStrictEqual({
            account: {
                ...account,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            environment: {
                ...environment,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            plan: {
                ...plan,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            secret: {
                ...secret,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            }
        });
    });

    it('should retrieve account context by environmentId', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        const plan = (await plans.createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();
        const secret = (await secretService.getInternalSecretForEnv(db.knex, environment!.id)).unwrap();

        const byEnvironmentId = await accountService.getAccountContext({ environmentId: environment!.id });

        expect(byEnvironmentId).toStrictEqual({
            account: {
                ...account,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            environment: {
                ...environment,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            plan: {
                ...plan,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            secret: {
                ...secret,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            }
        });
    });
});
