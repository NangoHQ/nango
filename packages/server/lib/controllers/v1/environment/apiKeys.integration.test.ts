import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { authenticateUser, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

describe('API Keys endpoints', () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    describe('GET /api/v1/environment/api-keys', () => {
        it('should be protected', async () => {
            // @ts-expect-error query params are required
            const res = await api.fetch('/api/v1/environment/api-keys', { method: 'GET', query: { env: 'dev' } });
            shouldBeProtected(res);
        });

        it('should list api keys for environment', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const res = await api.fetch('/api/v1/environment/api-keys', {
                method: 'GET',
                // @ts-expect-error query params are required
                query: { env: env.name },
                session
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data).toBeInstanceOf(Array);
            expect(res.json.data.length).toBeGreaterThanOrEqual(1);
            expect(res.json.data[0]).toMatchObject({
                id: expect.any(Number),
                display_name: expect.any(String),
                scopes: expect.any(Array),
                secret: expect.any(String),
                created_at: expect.any(String)
            });
        });
    });

    describe('POST /api/v1/environment/api-keys', () => {
        it('should create an api key with scopes', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const res = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params are required
                query: { env: env.name },
                body: { display_name: 'CI Deploy Key', scopes: ['environment:deploy'] },
                session
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data).toMatchObject({
                id: expect.any(Number),
                display_name: 'CI Deploy Key',
                scopes: ['environment:deploy'],
                secret: expect.any(String),
                created_at: expect.any(String)
            });
        });

        it('should default to environment:* scopes', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const res = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params are required
                query: { env: env.name },
                body: { display_name: 'Full access key' },
                session
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data.scopes).toEqual(['environment:*']);
        });

        it('should enforce max keys per environment limit', async () => {
            const { env, user, account } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            // Insert keys directly to approach the limit without 50 HTTP calls
            // The env already has 1 default key from seeding, so insert 49 more
            for (let i = 0; i < 49; i++) {
                const hashed = `fake-hash-${env.id}-${i}`;
                const [key] = await db
                    .knex('customer_keys')
                    .insert({
                        account_id: account.id,
                        key_type: 'api',
                        display_name: `bulk-key-${i}`,
                        scopes: ['environment:*'],
                        secret: `fake-secret-${i}`,
                        iv: '',
                        tag: '',
                        hashed
                    })
                    .returning('id');
                await db.knex('customer_keys_relations').insert({
                    customer_key_id: key!.id,
                    entity_type: 'environment',
                    entity_id: env.id
                });
            }

            // Now at 50 keys — next create should fail
            const res = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params are required
                query: { env: env.name },
                body: { display_name: 'One too many' },
                session
            });

            expect(res.res.status).toBe(400);
            expect((res.json as any).error.code).toBe('resource_capped');
        });
    });

    describe('PATCH /api/v1/environment/api-keys/:keyId', () => {
        it('should update scopes', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            // Create a key first
            const createRes = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params are required
                query: { env: env.name },
                body: { display_name: 'To update', scopes: ['environment:deploy'] },
                session
            });
            isSuccess(createRes.json);
            const keyId = createRes.json.data.id;

            // Update scopes
            const patchRes = await api.fetch(
                `/api/v1/environment/api-keys/${keyId}` as any,
                {
                    method: 'PATCH',
                    query: { env: env.name },
                    body: { scopes: ['environment:connections:read', 'environment:records:read'] } as any,
                    session
                } as any
            );

            expect(patchRes.res.status).toBe(200);
            expect(patchRes.json).toEqual({ success: true });

            // Verify scopes were updated
            const listRes = await api.fetch('/api/v1/environment/api-keys', {
                method: 'GET',
                // @ts-expect-error query params are required
                query: { env: env.name },
                session
            });
            isSuccess(listRes.json);
            const updated = listRes.json.data.find((k: any) => k.id === keyId);
            expect(updated!.scopes).toEqual(['environment:connections:read', 'environment:records:read']);
        });

        it('should return not_found when patching a key from another environment', async () => {
            const { env: envA, user } = await seeders.seedAccountEnvAndUser();
            const envB = await seeders.createEnvironmentSeed(envA.account_id, 'other-env');
            const session = await authenticateUser(api, user);

            const createRes = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params are required
                query: { env: envA.name },
                body: { display_name: 'Foreign key', scopes: ['environment:deploy'] },
                session
            });
            isSuccess(createRes.json);
            const keyId = createRes.json.data.id;

            const patchRes = await api.fetch(
                `/api/v1/environment/api-keys/${keyId}` as any,
                {
                    method: 'PATCH',
                    query: { env: envB.name },
                    body: { scopes: ['environment:connections:read'] } as any,
                    session
                } as any
            );

            expect(patchRes.res.status).toBe(404);
            expect(patchRes.json.error.code).toBe('not_found');
        });
    });

    describe('DELETE /api/v1/environment/api-keys/:keyId', () => {
        it('should soft-delete an api key', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            // Create a key
            const createRes = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params are required
                query: { env: env.name },
                body: { display_name: 'To delete' },
                session
            });
            isSuccess(createRes.json);
            const keyId = createRes.json.data.id;

            // Delete it
            const deleteRes = await api.fetch(
                `/api/v1/environment/api-keys/${keyId}` as any,
                {
                    method: 'DELETE',
                    query: { env: env.name },
                    session
                } as any
            );

            expect(deleteRes.res.status).toBe(200);
            expect(deleteRes.json).toEqual({ success: true });

            // Verify it's gone from the list
            const listRes = await api.fetch('/api/v1/environment/api-keys', {
                method: 'GET',
                // @ts-expect-error query params are required
                query: { env: env.name },
                session
            });
            isSuccess(listRes.json);
            const deleted = listRes.json.data.find((k: any) => k.id === keyId);
            expect(deleted).toBeUndefined();
        });

        it('should reject auth with deleted key', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            // Create and get the secret
            const createRes = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params are required
                query: { env: env.name },
                body: { display_name: 'To delete and test auth' },
                session
            });
            isSuccess(createRes.json);
            const keyId = createRes.json.data.id;
            const secret = createRes.json.data.secret;

            // Key should authenticate
            const authRes1 = await api.fetch('/integrations', { method: 'GET', token: secret });
            expect(authRes1.res.status).toBe(200);

            // Delete the key
            await api.fetch(
                `/api/v1/environment/api-keys/${keyId}` as any,
                {
                    method: 'DELETE',
                    query: { env: env.name },
                    session
                } as any
            );

            // Key should no longer authenticate
            const authRes2 = await api.fetch('/integrations', { method: 'GET', token: secret });
            expect(authRes2.res.status).toBe(401);
        });

        it('should return not_found when deleting a key from another environment', async () => {
            const { env: envA, user } = await seeders.seedAccountEnvAndUser();
            const envB = await seeders.createEnvironmentSeed(envA.account_id, 'other-env-delete');
            const session = await authenticateUser(api, user);

            const createRes = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params are required
                query: { env: envA.name },
                body: { display_name: 'Foreign delete key' },
                session
            });
            isSuccess(createRes.json);
            const keyId = createRes.json.data.id;

            const deleteRes = await api.fetch(
                `/api/v1/environment/api-keys/${keyId}` as any,
                {
                    method: 'DELETE',
                    query: { env: envB.name },
                    session
                } as any
            );

            expect(deleteRes.res.status).toBe(404);
            expect(deleteRes.json.error.code).toBe('not_found');
        });
    });

    describe('scope enforcement', () => {
        it('should allow access with matching scope', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const createRes = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params are required
                query: { env: env.name },
                body: { display_name: 'Integrations only', scopes: ['environment:integrations:list'] },
                session
            });
            isSuccess(createRes.json);

            const res = await api.fetch('/integrations', { method: 'GET', token: createRes.json.data.secret });
            expect(res.res.status).toBe(200);
        });

        it('should deny access with missing scope', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const createRes = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params are required
                query: { env: env.name },
                body: { display_name: 'Connections only', scopes: ['environment:connections:read'] },
                session
            });
            isSuccess(createRes.json);

            const res = await api.fetch('/integrations', { method: 'GET', token: createRes.json.data.secret });
            expect(res.res.status).toBe(403);
        });

        it('should allow wildcard scope', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const createRes = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params are required
                query: { env: env.name },
                body: { display_name: 'Full access', scopes: ['environment:*'] },
                session
            });
            isSuccess(createRes.json);

            const res = await api.fetch('/integrations', { method: 'GET', token: createRes.json.data.secret });
            expect(res.res.status).toBe(200);
        });

        it('should allow legacy api_secrets key with environment:* scope semantics', async () => {
            const { apiKey } = await seeders.seedAccountEnvAndUser();
            // Legacy key from api_secrets resolves to explicit environment:* semantics
            const res = await api.fetch('/integrations', { method: 'GET', token: apiKey.secret });
            expect(res.res.status).toBe(200);
        });
    });

    describe('RBAC', () => {
        it('should deny production_support from creating keys on prod', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser({ plan: { has_rbac: true } });
            await db.knex('_nango_environments').where({ id: env.id }).update({ is_production: true });
            await db.knex('_nango_users').where({ id: user.id }).update({ role: 'production_support' });

            const session = await authenticateUser(api, user);
            const res = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params are required
                query: { env: env.name },
                body: { display_name: 'Should fail' },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should allow production_support to list keys on prod but mask secrets', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser({ plan: { has_rbac: true } });
            await db.knex('_nango_environments').where({ id: env.id }).update({ is_production: true });
            await db.knex('_nango_users').where({ id: user.id }).update({ role: 'production_support' });

            const session = await authenticateUser(api, user);
            const res = await api.fetch('/api/v1/environment/api-keys', {
                method: 'GET',
                // @ts-expect-error query params are required
                query: { env: env.name },
                session
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data.length).toBeGreaterThanOrEqual(1);
            // Secret should be masked: ****<last4>
            for (const key of res.json.data) {
                expect(key.secret).toMatch(/^\*{4}.{4}$/);
            }
        });

        it('should deny production_support from updating scopes on prod', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser({ plan: { has_rbac: true } });
            await db.knex('_nango_environments').where({ id: env.id }).update({ is_production: true });

            // Get the default key id
            const keys = await db
                .knex('customer_keys')
                .select('customer_keys.id')
                .join('customer_keys_relations', 'customer_keys_relations.customer_key_id', 'customer_keys.id')
                .where({ 'customer_keys_relations.entity_type': 'environment', 'customer_keys_relations.entity_id': env.id, 'customer_keys.key_type': 'api' })
                .whereNull('customer_keys.deleted_at');
            const keyId = keys[0]!.id;

            await db.knex('_nango_users').where({ id: user.id }).update({ role: 'production_support' });

            const session = await authenticateUser(api, user);
            const res = await api.fetch(
                `/api/v1/environment/api-keys/${keyId}` as any,
                {
                    method: 'PATCH',
                    query: { env: env.name },
                    body: { scopes: ['environment:connections:read'] } as any,
                    session
                } as any
            );

            expect(res.res.status).toBe(403);
        });

        it('should deny production_support from deleting keys on prod', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser({ plan: { has_rbac: true } });
            await db.knex('_nango_environments').where({ id: env.id }).update({ is_production: true });

            const keys = await db
                .knex('customer_keys')
                .select('customer_keys.id')
                .join('customer_keys_relations', 'customer_keys_relations.customer_key_id', 'customer_keys.id')
                .where({ 'customer_keys_relations.entity_type': 'environment', 'customer_keys_relations.entity_id': env.id, 'customer_keys.key_type': 'api' })
                .whereNull('customer_keys.deleted_at');
            const keyId = keys[0]!.id;

            await db.knex('_nango_users').where({ id: user.id }).update({ role: 'production_support' });

            const session = await authenticateUser(api, user);
            const res = await api.fetch(
                `/api/v1/environment/api-keys/${keyId}` as any,
                {
                    method: 'DELETE',
                    query: { env: env.name },
                    session
                } as any
            );

            expect(res.res.status).toBe(403);
        });

        it('should allow admin full access on prod', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser({ plan: { has_rbac: true } });
            await db.knex('_nango_environments').where({ id: env.id }).update({ is_production: true });
            // user is already administrator by default

            const session = await authenticateUser(api, user);

            // Create
            const createRes = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params are required
                query: { env: env.name },
                body: { display_name: 'Admin prod key', scopes: ['environment:deploy'] },
                session
            });
            expect(createRes.res.status).toBe(200);
            isSuccess(createRes.json);
            const keyId = createRes.json.data.id;
            // Secret should NOT be masked for admin
            expect(createRes.json.data.secret).not.toMatch(/^\*{4}/);

            // List — secrets should be visible
            const listRes = await api.fetch('/api/v1/environment/api-keys', {
                method: 'GET',
                // @ts-expect-error query params are required
                query: { env: env.name },
                session
            });
            expect(listRes.res.status).toBe(200);
            isSuccess(listRes.json);
            const adminKey = listRes.json.data.find((k: any) => k.id === keyId);
            expect(adminKey!.secret).not.toMatch(/^\*{4}/);

            // Update scopes
            const patchRes = await api.fetch(
                `/api/v1/environment/api-keys/${keyId}` as any,
                {
                    method: 'PATCH',
                    query: { env: env.name },
                    body: { scopes: ['environment:connections:read'] } as any,
                    session
                } as any
            );
            expect(patchRes.res.status).toBe(200);

            // Delete
            const deleteRes = await api.fetch(
                `/api/v1/environment/api-keys/${keyId}` as any,
                {
                    method: 'DELETE',
                    query: { env: env.name },
                    session
                } as any
            );
            expect(deleteRes.res.status).toBe(200);
        });

        it('should allow all roles full access on non-prod', async () => {
            const { env, user } = await seeders.seedAccountEnvAndUser();
            // env is non-prod by default
            await db.knex('_nango_users').where({ id: user.id }).update({ role: 'production_support' });

            const session = await authenticateUser(api, user);

            // Create — should work on non-prod even for support role
            const createRes = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                // @ts-expect-error query params are required
                query: { env: env.name },
                body: { display_name: 'Support non-prod key' },
                session
            });
            expect(createRes.res.status).toBe(200);
            isSuccess(createRes.json);

            // Secret should be visible on non-prod
            expect(createRes.json.data.secret).not.toMatch(/^\*{4}/);

            // List — secrets visible
            const listRes = await api.fetch('/api/v1/environment/api-keys', {
                method: 'GET',
                // @ts-expect-error query params are required
                query: { env: env.name },
                session
            });
            expect(listRes.res.status).toBe(200);
            isSuccess(listRes.json);
            for (const key of listRes.json.data) {
                expect(key.secret).not.toMatch(/^\*{4}/);
            }

            // Delete — should work
            const keyId = createRes.json.data.id;
            const deleteRes = await api.fetch(
                `/api/v1/environment/api-keys/${keyId}` as any,
                {
                    method: 'DELETE',
                    query: { env: env.name },
                    session
                } as any
            );
            expect(deleteRes.res.status).toBe(200);
        });
    });
});
