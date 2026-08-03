import { v4 as uuid } from 'uuid';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { metrics } from '@nangohq/utils';

import { envs } from '../env.js';
import { createAccount as createTestAccount } from '../seeders/account.seeder.js';
import { seedAccountEnvAndUser } from '../seeders/global.seeder.js';
import accountService from './account.service.js';
import customerKeyService from './customerKey.service.js';
import environmentService, { defaultEnvironments } from './environment.service.js';
import * as plans from './plans/plans.js';
import { createSandboxApiKeyToken, decryptSandboxSigningSecret } from './sandbox-api-key.js';
import secretService from './secret.service.js';
import userService from './user.service.js';

import type { DBTeam, DBUser, Role } from '@nangohq/types';

describe('Account service', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    async function createAccountWithUser({
        email,
        role = 'administrator',
        suspended = false
    }: {
        email: string;
        role?: Role;
        suspended?: boolean;
    }): Promise<{ account: DBTeam; user: DBUser }> {
        const account = await createTestAccount();
        const user = await userService.createUser({
            email,
            name: email,
            account_id: account.id,
            email_verified: true,
            role
        });

        if (!user) {
            throw new Error('Failed to create test user');
        }

        if (suspended) {
            const updated = await userService.update({ id: user.id, suspended: true, suspended_at: new Date() });
            if (!updated) {
                throw new Error('Failed to suspend test user');
            }
            return { account, user: updated };
        }

        return { account, user };
    }

    async function createPlan(accountId: number, name: 'free' | 'growth-v2') {
        const result = await plans.createPlan(db.knex, { account_id: accountId, name });
        return result.unwrap();
    }

    describe('findAccountWithSameDomain', () => {
        it('does not suggest accounts for a free email domain', async () => {
            const current = await createAccountWithUser({ email: `${uuid()}@gmail.com` });
            await createAccountWithUser({ email: `${uuid()}@gmail.com` });

            await expect(accountService.findAccountWithSameDomain({ email: current.user.email, currentAccountId: current.account.id })).resolves.toBeNull();
        });

        it('suggests the only eligible account with a matching custom domain', async () => {
            const domain = `${uuid()}.example.com`;
            const current = await createAccountWithUser({ email: `new@${domain}` });
            const candidate = await createAccountWithUser({ email: `admin@${domain}` });
            await createPlan(candidate.account.id, 'free');

            await expect(accountService.findAccountWithSameDomain({ email: current.user.email, currentAccountId: current.account.id })).resolves.toEqual({
                id: candidate.account.id,
                name: candidate.account.name
            });
        });

        it('prefers a paid matching account over a free account', async () => {
            const domain = `${uuid()}.example.com`;
            const current = await createAccountWithUser({ email: `new@${domain}` });
            const freeCandidate = await createAccountWithUser({ email: `free@${domain}` });
            const paidCandidate = await createAccountWithUser({ email: `paid@${domain}` });
            await createPlan(freeCandidate.account.id, 'free');
            await createPlan(paidCandidate.account.id, 'growth-v2');

            await expect(accountService.findAccountWithSameDomain({ email: current.user.email, currentAccountId: current.account.id })).resolves.toEqual({
                id: paidCandidate.account.id,
                name: paidCandidate.account.name
            });
        });

        it('uses active member count to rank matching accounts with the same plan', async () => {
            const domain = `${uuid()}.example.com`;
            const current = await createAccountWithUser({ email: `new@${domain}` });
            const smallerCandidate = await createAccountWithUser({ email: `small@${domain}` });
            const largerCandidate = await createAccountWithUser({ email: `large@${domain}` });
            await createPlan(smallerCandidate.account.id, 'free');
            await createPlan(largerCandidate.account.id, 'free');
            const additionalMember = await userService.createUser({
                email: `${uuid()}@another.example.com`,
                name: 'Additional member',
                account_id: largerCandidate.account.id,
                email_verified: true,
                role: 'development_full_access'
            });
            expect(additionalMember).not.toBeNull();

            await expect(accountService.findAccountWithSameDomain({ email: current.user.email, currentAccountId: current.account.id })).resolves.toEqual({
                id: largerCandidate.account.id,
                name: largerCandidate.account.name
            });
        });

        it('excludes the current account, suspended matching users, and accounts without an active administrator', async () => {
            const domain = `${uuid()}.example.com`;
            const current = await createAccountWithUser({ email: `new@${domain}` });
            const suspendedCandidate = await createAccountWithUser({ email: `suspended@${domain}`, suspended: true });
            const noAdministrator = await createAccountWithUser({ email: `member@${domain}`, role: 'development_full_access' });
            await createPlan(suspendedCandidate.account.id, 'growth-v2');
            await createPlan(noAdministrator.account.id, 'growth-v2');

            await expect(accountService.findAccountWithSameDomain({ email: current.user.email, currentAccountId: current.account.id })).resolves.toBeNull();
        });
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
        const secret = (await secretService.getDefaultSecretForEnv(db.knex, environment!)).unwrap();
        const apiKeys = (await customerKeyService.getApiKeysByEnv(db.knex, environment!.id)).unwrap();

        const bySecretKey = await accountService.getAccountContext({ secretKey: apiKeys[0]!.secret });

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
                apiKeyId: expect.any(Number),
                apiKeyDisplayName: 'Default - Full access'
            }
        });
    });

    it('should return null when customer key is missing (no fallback to api_secrets)', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        await plans.createPlan(db.knex, { account_id: account.id, name: 'free' });

        await db.knex('customer_keys_relations').where({ entity_type: 'environment', entity_id: environment!.id }).delete();
        await db.knex('customer_keys').where({ account_id: account.id, key_type: 'api' }).delete();

        const bySecretKey = await accountService.getAccountContext({ secretKey: environment!.secret_key });

        expect(bySecretKey).toBeNull();
    });

    it('should prefer customer key scopes when both tables match the same secret', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        await plans.createPlan(db.knex, { account_id: account.id, name: 'free' });
        const apiKeys = (await customerKeyService.getApiKeysByEnv(db.knex, environment!.id)).unwrap();

        await db
            .knex('customer_keys')
            .update({ scopes: ['environment:deploy'] })
            .where({ account_id: account.id, key_type: 'api' })
            .whereNull('deleted_at');

        const bySecretKey = await accountService.getAccountContext({ secretKey: apiKeys[0]!.secret });

        expect(bySecretKey?.auth).toStrictEqual({
            source: 'customer_key',
            scopes: ['environment:deploy'],
            apiKeyId: expect.any(Number),
            apiKeyDisplayName: 'Default - Full access'
        });
    });

    it('should return null when matching customer key is soft-deleted (no fallback to api_secrets)', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        await plans.createPlan(db.knex, { account_id: account.id, name: 'free' });

        await db.knex('customer_keys').update({ deleted_at: new Date() }).where({ account_id: account.id, key_type: 'api' });

        const bySecretKey = await accountService.getAccountContext({ secretKey: environment!.secret_key });

        expect(bySecretKey).toBeNull();
    });

    it('should return null when matching customer key relation is not environment-scoped (no fallback to api_secrets)', async () => {
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

        expect(bySecretKey).toBeNull();
    });

    it('should return null when secretKey does not match either table', async () => {
        const bySecretKey = await accountService.getAccountContext({ secretKey: uuid() });

        expect(bySecretKey).toBeNull();
    });

    it('should retrieve account context by sandbox API key token', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        const plan = (await plans.createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();
        const secret = (await secretService.getDefaultSecretForEnv(db.knex, environment!)).unwrap();
        const apiKeys = (await customerKeyService.getApiKeysByEnv(db.knex, environment!.id)).unwrap();
        const apiKey = apiKeys[0]!;
        const signingSecret = decryptSandboxSigningSecret(apiKey)!;
        const dryrunId = '00000000-0000-4000-8000-000000000001';

        const sandboxToken = createSandboxApiKeyToken({
            parentApiKeyId: apiKey.id,
            signingSecret,
            purpose: 'dryrun',
            dryrunId,
            expiresAt: new Date(Date.now() + 60 * 1000)
        });

        const bySecretKey = await accountService.getAccountContext({ secretKey: sandboxToken });

        expect(sandboxToken).toMatch(/^nango_sbx_v1_/);
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
                source: 'sandbox_token',
                scopes: ['environment:*', 'environment:connections:read', 'environment:integrations:read', 'environment:proxy'],
                apiKeyId: apiKey.id,
                purpose: 'dryrun',
                dryrunId
            }
        });
    });

    it('should return null when sandbox API key token is expired', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        await plans.createPlan(db.knex, { account_id: account.id, name: 'free' });
        const apiKeys = (await customerKeyService.getApiKeysByEnv(db.knex, environment!.id)).unwrap();
        const signingSecret = decryptSandboxSigningSecret(apiKeys[0]!)!;
        const now = Date.now();
        const sandboxToken = createSandboxApiKeyToken({
            parentApiKeyId: apiKeys[0]!.id,
            signingSecret,
            purpose: 'dryrun',
            dryrunId: '00000000-0000-4000-8000-000000000001',
            expiresAt: new Date(now - 60 * 1000),
            issuedAt: now - 120 * 1000
        });

        const bySecretKey = await accountService.getAccountContext({ secretKey: sandboxToken });

        expect(bySecretKey).toBeNull();
    });

    it('should return null when sandbox API key token parent key is soft-deleted', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        await plans.createPlan(db.knex, { account_id: account.id, name: 'free' });
        const apiKeys = (await customerKeyService.getApiKeysByEnv(db.knex, environment!.id)).unwrap();
        const apiKey = apiKeys[0]!;
        const signingSecret = decryptSandboxSigningSecret(apiKey)!;

        const sandboxToken = createSandboxApiKeyToken({
            parentApiKeyId: apiKey.id,
            signingSecret,
            purpose: 'dryrun',
            dryrunId: '00000000-0000-4000-8000-000000000001',
            expiresAt: new Date(Date.now() + 60 * 1000)
        });

        await db.knex('customer_keys').where({ id: apiKey.id }).update({ deleted_at: new Date() });

        const bySecretKey = await accountService.getAccountContext({ secretKey: sandboxToken });

        expect(bySecretKey).toBeNull();
    });

    it('should apply current parent scopes when resolving sandbox API key token', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        await plans.createPlan(db.knex, { account_id: account.id, name: 'free' });

        const parentKey = (
            await customerKeyService.createApiKey(db.knex, {
                accountId: account.id,
                environmentId: environment!.id,
                displayName: `sandbox-parent-${uuid()}`,
                scopes: ['environment:functions:dryrun']
            })
        ).unwrap();
        const signingSecret = decryptSandboxSigningSecret(parentKey)!;
        const dryrunId = '00000000-0000-4000-8000-000000000001';

        const sandboxToken = createSandboxApiKeyToken({
            parentApiKeyId: parentKey.id,
            signingSecret,
            purpose: 'dryrun',
            dryrunId,
            expiresAt: new Date(Date.now() + 60 * 1000)
        });

        await customerKeyService.updateApiKeyScopes(db.knex, parentKey.id, ['environment:records:read'], environment!.id);

        const bySecretKey = await accountService.getAccountContext({ secretKey: sandboxToken });

        expect(bySecretKey?.auth).toStrictEqual({
            source: 'sandbox_token',
            scopes: ['environment:records:read', 'environment:connections:read', 'environment:integrations:read', 'environment:proxy'],
            apiKeyId: parentKey.id,
            purpose: 'dryrun',
            dryrunId
        });
    });

    it('should debounce customer key last_used_at updates when resolving by secretKey', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        await plans.createPlan(db.knex, { account_id: account.id, name: 'free' });
        const apiKeys = (await customerKeyService.getApiKeysByEnv(db.knex, environment!.id)).unwrap();
        const customerKeySecret = apiKeys[0]!.secret;

        const initial = await accountService.getAccountContext({ secretKey: customerKeySecret });
        expect(initial?.auth?.source).toBe('customer_key');
        const apiKeyId = initial?.auth?.apiKeyId;
        expect(apiKeyId).toBeDefined();

        const firstLastUsedAt = (await db.knex('customer_keys').select('last_used_at').where({ id: apiKeyId! }).first())?.last_used_at;
        expect(firstLastUsedAt).toBeTruthy();

        const recentTimestamp = new Date(Date.now() - 5 * 1000);
        await db.knex('customer_keys').where({ id: apiKeyId! }).update({ last_used_at: recentTimestamp });

        await accountService.getAccountContext({ secretKey: customerKeySecret });
        const secondLastUsedAt = (await db.knex('customer_keys').select('last_used_at').where({ id: apiKeyId! }).first())?.last_used_at;
        expect(new Date(secondLastUsedAt).toISOString()).toBe(recentTimestamp.toISOString());

        const staleTimestamp = new Date(Date.now() - 2 * 60 * 1000);
        await db.knex('customer_keys').where({ id: apiKeyId! }).update({ last_used_at: staleTimestamp });

        await accountService.getAccountContext({ secretKey: customerKeySecret });
        const thirdLastUsedAt = (await db.knex('customer_keys').select('last_used_at').where({ id: apiKeyId! }).first())?.last_used_at;
        expect(new Date(thirdLastUsedAt).getTime()).toBeGreaterThan(staleTimestamp.getTime());
    });

    it('should return environment:* scopes for internalSecretKey (api_secret path)', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        await plans.createPlan(db.knex, { account_id: account.id, name: 'free' });
        const secret = (await secretService.getDefaultSecretForEnv(db.knex, environment!)).unwrap();

        const result = await accountService.getAccountContextByApiKey({ internalSecretKey: secret.secret });

        expect(result?.auth).toStrictEqual({
            source: 'api_secret',
            scopes: ['environment:*']
        });
    });

    describe('getPersistAuthContext', () => {
        it('should return exactly the narrow context fields', async () => {
            const { account, env, plan, secret } = await seedAccountEnvAndUser();

            const result = (await accountService.getPersistAuthContext(secret.secret)).unwrap();

            expect(result).toStrictEqual({
                account: { id: account.id },
                environment: { id: env.id, name: env.name },
                plan: { id: plan.id, name: 'free', records_store: plan.records_store }
            });
        });

        it('should return null for an unknown key', async () => {
            const result = (await accountService.getPersistAuthContext(`nango_secret_key_${uuid()}`)).unwrap();
            expect(result).toBeNull();
        });

        it('should resolve env-var keys before the DB lookup', async () => {
            const account = await createTestAccount();
            const envName = uuid();
            const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: envName });
            await plans.createPlan(db.knex, { account_id: account.id, name: 'free' });

            const envVarName = `NANGO_SECRET_KEY_${envName.toUpperCase()}`;
            const envVarKey = `nango_secret_key_${uuid()}`;
            process.env[envVarName] = envVarKey;
            try {
                const result = (await accountService.getPersistAuthContext(envVarKey)).unwrap();
                expect(result?.environment.id).toBe(environment!.id);
                expect(result?.account.id).toBe(account.id);
            } finally {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete process.env[envVarName];
            }
        });

        it('should serve from cache within the TTL when enabled', async () => {
            const previous = envs.AUTH_PERSIST_CONTEXT_CACHE_ENABLED;
            (envs as { AUTH_PERSIST_CONTEXT_CACHE_ENABLED: boolean }).AUTH_PERSIST_CONTEXT_CACHE_ENABLED = true;
            const incrementSpy = vi.spyOn(metrics, 'increment');
            try {
                const { env, secret } = await seedAccountEnvAndUser();

                // First lookup: miss -> resolved from the DB and cached
                const first = (await accountService.getPersistAuthContext(secret.secret)).unwrap();
                expect(first?.environment.id).toBe(env.id);
                expect(incrementSpy).toHaveBeenCalledWith(metrics.Types.AUTH_CONTEXT_CACHE, 1, { cache: 'persist_internal_secret', result: 'miss' });

                // Break the DB row; a cache hit must still resolve, proving it is served from the cache
                await db.knex('api_secrets').where({ environment_id: env.id }).update({ hashed: uuid() });
                incrementSpy.mockClear();

                const second = (await accountService.getPersistAuthContext(secret.secret)).unwrap();
                expect(incrementSpy).toHaveBeenCalledWith(metrics.Types.AUTH_CONTEXT_CACHE, 1, { cache: 'persist_internal_secret', result: 'hit' });
                expect(second).toStrictEqual(first);
            } finally {
                (envs as { AUTH_PERSIST_CONTEXT_CACHE_ENABLED: boolean }).AUTH_PERSIST_CONTEXT_CACHE_ENABLED = previous;
            }
        });

        it('should not cache when disabled (default)', async () => {
            expect(envs.AUTH_PERSIST_CONTEXT_CACHE_ENABLED).toBe(false);
            const incrementSpy = vi.spyOn(metrics, 'increment');
            const { env, secret } = await seedAccountEnvAndUser();

            const first = (await accountService.getPersistAuthContext(secret.secret)).unwrap();
            expect(first?.environment.id).toBe(env.id);

            // With caching off, the next lookup goes to the (now broken) DB and returns null
            await db.knex('api_secrets').where({ environment_id: env.id }).update({ hashed: uuid() });
            const second = (await accountService.getPersistAuthContext(secret.secret)).unwrap();
            expect(second).toBeNull();
            expect(incrementSpy).not.toHaveBeenCalledWith(metrics.Types.AUTH_CONTEXT_CACHE, 1, expect.anything());
        });
    });

    it('should return environment:* scopes for env var key (env_var path)', async () => {
        const account = await createTestAccount();
        const envName = uuid();
        await environmentService.createEnvironment(db.knex, { accountId: account.id, name: envName });
        await plans.createPlan(db.knex, { account_id: account.id, name: 'free' });

        const envVarName = `NANGO_SECRET_KEY_${envName.toUpperCase()}`;
        const envVarKey = `nango_secret_key_${uuid()}`;
        process.env[envVarName] = envVarKey;
        try {
            const result = await accountService.getAccountContextByApiKey({ secretKey: envVarKey });

            expect(result?.auth).toStrictEqual({
                source: 'env_var',
                scopes: ['environment:*']
            });
        } finally {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete process.env[envVarName];
        }
    });

    it('should retrieve account context by publicKey', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        const plan = (await plans.createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();
        const secret = (await secretService.getDefaultSecretForEnv(db.knex, environment!)).unwrap();

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
        const secret = (await secretService.getDefaultSecretForEnv(db.knex, environment!)).unwrap();

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
        const secret = (await secretService.getDefaultSecretForEnv(db.knex, environment!)).unwrap();

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
        const secret = (await secretService.getDefaultSecretForEnv(db.knex, environment!)).unwrap();

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
        const secret = (await secretService.getDefaultSecretForEnv(db.knex, environment!)).unwrap();

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
