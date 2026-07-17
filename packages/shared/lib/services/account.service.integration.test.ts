import { v4 as uuid } from 'uuid';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { metrics } from '@nangohq/utils';

import { envs } from '../env.js';
import { createAccount as createTestAccount } from '../seeders/account.seeder.js';
import accountService from './account.service.js';
import customerKeyService from './customerKey.service.js';
import environmentService, { defaultEnvironments } from './environment.service.js';
import * as plans from './plans/plans.js';
import { createSandboxApiKeyToken, decryptSandboxSigningSecret } from './sandbox-api-key.js';
import secretService from './secret.service.js';

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

    describe('internal secret account context cache', () => {
        const setCacheMode = (mode: string) => {
            (envs as { AUTH_ACCOUNT_CONTEXT_CACHE_MODE: string }).AUTH_ACCOUNT_CONTEXT_CACHE_MODE = mode;
        };
        const defaultMode = envs.AUTH_ACCOUNT_CONTEXT_CACHE_MODE;

        const seedEnvironmentWithSecret = async () => {
            const account = await createTestAccount();
            const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
            await plans.createPlan(db.knex, { account_id: account.id, name: 'free' });
            const secret = (await secretService.getDefaultSecretForEnv(db.knex, environment!)).unwrap();
            return { environment: environment!, secret };
        };

        afterEach(() => {
            setCacheMode(defaultMode);
            vi.useRealTimers();
        });

        it('should serve from cache within the TTL', async () => {
            setCacheMode('on');
            const { environment, secret } = await seedEnvironmentWithSecret();

            const first = await accountService.getAccountContextByApiKey({ internalSecretKey: secret.secret });
            expect(first?.environment.id).toBe(environment.id);

            // Break the DB lookup; a cached context must still resolve without hitting the DB
            await db.knex('api_secrets').where({ environment_id: environment.id }).update({ hashed: uuid() });

            const second = await accountService.getAccountContextByApiKey({ internalSecretKey: secret.secret });
            expect(second?.environment.id).toBe(environment.id);
            expect(second).toStrictEqual(first);
        });

        it('should refetch once the cache TTL elapses', async () => {
            setCacheMode('on');
            // Fake only hrtime (the cache clock); DB clients keep real timers
            vi.useFakeTimers({ toFake: ['hrtime'] });
            const { environment, secret } = await seedEnvironmentWithSecret();

            const first = await accountService.getAccountContextByApiKey({ internalSecretKey: secret.secret });
            expect(first?.environment.id).toBe(environment.id);

            await db.knex('api_secrets').where({ environment_id: environment.id }).update({ hashed: uuid() });
            vi.advanceTimersByTime(envs.AUTH_ACCOUNT_CONTEXT_CACHE_TTL_MS + 1);

            const second = await accountService.getAccountContextByApiKey({ internalSecretKey: secret.secret });
            expect(second).toBeNull();
        });

        it('should not serve from cache in dry mode but still record hits', async () => {
            setCacheMode('dry');
            const incrementSpy = vi.spyOn(metrics, 'increment');
            const { environment, secret } = await seedEnvironmentWithSecret();

            const first = await accountService.getAccountContextByApiKey({ internalSecretKey: secret.secret });
            expect(first?.environment.id).toBe(environment.id);

            // The cached entry is fresh, but dry mode must still go to the DB and see the revoked key
            await db.knex('api_secrets').where({ environment_id: environment.id }).update({ hashed: uuid() });

            const second = await accountService.getAccountContextByApiKey({ internalSecretKey: secret.secret });
            expect(second).toBeNull();

            expect(incrementSpy).toHaveBeenCalledWith(metrics.Types.AUTH_ACCOUNT_CONTEXT_CACHE, 1, { result: 'miss', mode: 'dry' });
            expect(incrementSpy).toHaveBeenCalledWith(metrics.Types.AUTH_ACCOUNT_CONTEXT_CACHE, 1, { result: 'hit', mode: 'dry' });
        });

        it('should not refresh fresh entries in dry mode', async () => {
            setCacheMode('dry');
            vi.useFakeTimers({ toFake: ['hrtime'] });
            const incrementSpy = vi.spyOn(metrics, 'increment');
            const { secret } = await seedEnvironmentWithSecret();
            const ttlMs = envs.AUTH_ACCOUNT_CONTEXT_CACHE_TTL_MS;

            // t0: miss, entry cached
            await accountService.getAccountContextByApiKey({ internalSecretKey: secret.secret });
            // just before expiry: hit recorded, but must NOT reset the entry's TTL
            vi.advanceTimersByTime(ttlMs - 1000);
            await accountService.getAccountContextByApiKey({ internalSecretKey: secret.secret });
            // past the original expiry: 'on' mode would miss here, so dry must record a miss too
            vi.advanceTimersByTime(2000);
            incrementSpy.mockClear();
            await accountService.getAccountContextByApiKey({ internalSecretKey: secret.secret });

            expect(incrementSpy).toHaveBeenCalledWith(metrics.Types.AUTH_ACCOUNT_CONTEXT_CACHE, 1, { result: 'miss', mode: 'dry' });
        });

        it('should not touch the cache when the mode is off', async () => {
            expect(envs.AUTH_ACCOUNT_CONTEXT_CACHE_MODE).toBe('off');
            const incrementSpy = vi.spyOn(metrics, 'increment');
            const { environment, secret } = await seedEnvironmentWithSecret();

            const first = await accountService.getAccountContextByApiKey({ internalSecretKey: secret.secret });
            expect(first?.environment.id).toBe(environment.id);

            expect(incrementSpy).not.toHaveBeenCalledWith(metrics.Types.AUTH_ACCOUNT_CONTEXT_CACHE, 1, expect.anything());
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
