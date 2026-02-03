import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

import type { DBConnection } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/connections/:connectionId';

describe(`PATCH ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            params: { connectionId: 'test' },
            query: { provider_config_key: 'github' },
            body: {}
        });

        shouldBeProtected(res);
    });

    it('should return 400 for unknown provider', async () => {
        const { secret } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: secret.secret,
            params: { connectionId: 'test' },
            query: { provider_config_key: 'unknown' },
            body: {}
        });

        isError(res.json);
        expect(res.json).toMatchObject({
            error: { code: 'unknown_provider_config' }
        });
        expect(res.res.status).toBe(400);
    });

    it('should return 404 for unknown connection', async () => {
        const { env, secret } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: secret.secret,
            params: { connectionId: 'unknown' },
            query: { provider_config_key: 'github' },
            body: {}
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'not_found', message: 'Failed to find connection' }
        });
        expect(res.res.status).toBe(404);
    });

    describe('end_user', () => {
        it('should update end_user only', async () => {
            const { env, secret } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

            const res = await api.fetch(endpoint, {
                method: 'PATCH',
                token: secret.secret,
                params: { connectionId: conn.connection_id },
                query: { provider_config_key: 'github' },
                body: {
                    end_user: { id: 'user-123', email: 'test@example.com', display_name: 'Test User' }
                }
            });

            isSuccess(res.json);
            expect(res.json).toStrictEqual({ success: true });

            const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
            expect(updatedConn?.end_user_id).not.toBeNull();
        });
    });

    describe('tags', () => {
        it('should update tags only', async () => {
            const { env, secret } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

            const res = await api.fetch(endpoint, {
                method: 'PATCH',
                token: secret.secret,
                params: { connectionId: conn.connection_id },
                query: { provider_config_key: 'github' },
                body: { tags: { projectId: '123', orgId: '456' } }
            });

            isSuccess(res.json);
            expect(res.json).toStrictEqual({ success: true });

            // Keys are normalized to lowercase by connectionTagsSchema
            const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
            expect(updatedConn?.tags).toStrictEqual({ projectid: '123', orgid: '456' });
        });

        it('should update both tags and end_user', async () => {
            const { env, secret } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

            const res = await api.fetch(endpoint, {
                method: 'PATCH',
                token: secret.secret,
                params: { connectionId: conn.connection_id },
                query: { provider_config_key: 'github' },
                body: {
                    tags: { env: 'production' },
                    end_user: { id: 'user-456' }
                }
            });

            isSuccess(res.json);
            expect(res.json).toStrictEqual({ success: true });

            const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
            // Tags are merged: end_user generated tags + explicit tags (explicit tags take priority)
            expect(updatedConn?.tags).toStrictEqual({ end_user_id: 'user-456', env: 'production' });
            expect(updatedConn?.end_user_id).not.toBeNull();
        });

        it('should fail with invalid tag key format', async () => {
            const { env, secret } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

            const res = await api.fetch(endpoint, {
                method: 'PATCH',
                token: secret.secret,
                params: { connectionId: conn.connection_id },
                query: { provider_config_key: 'github' },
                body: {
                    tags: { '123invalid': 'value' }
                }
            });

            isError(res.json);
            expect(res.json).toMatchObject({
                error: { code: 'invalid_body' }
            });
            expect(res.res.status).toBe(400);
        });

        it('should allow tag values with spaces', async () => {
            const { env, secret } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

            const res = await api.fetch(endpoint, {
                method: 'PATCH',
                token: secret.secret,
                params: { connectionId: conn.connection_id },
                query: { provider_config_key: 'github' },
                body: {
                    tags: { key: 'value with spaces' }
                }
            });

            isSuccess(res.json);
            expect(res.json).toStrictEqual({ success: true });

            const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
            expect(updatedConn?.tags).toStrictEqual({ key: 'value with spaces' });
        });

        it('should replace existing tags completely', async () => {
            const { env, secret } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

            await db
                .knex('_nango_connections')
                .where({ id: conn.id })
                .update({ tags: { old: 'value', keep: 'this' } });

            // Update with new tags (should replace, not merge)
            const res = await api.fetch(endpoint, {
                method: 'PATCH',
                token: secret.secret,
                params: { connectionId: conn.connection_id },
                query: { provider_config_key: 'github' },
                body: { tags: { new: 'value' } }
            });

            isSuccess(res.json);

            const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
            expect(updatedConn?.tags).toStrictEqual({ new: 'value' });
            expect(updatedConn?.tags).not.toHaveProperty('old');
            expect(updatedConn?.tags).not.toHaveProperty('keep');
        });

        it('should set tags on connection without existing tags', async () => {
            const { env, secret } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

            const beforeConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
            expect(beforeConn?.tags).toEqual({});

            const res = await api.fetch(endpoint, {
                method: 'PATCH',
                token: secret.secret,
                params: { connectionId: conn.connection_id },
                query: { provider_config_key: 'github' },
                body: { tags: { first: 'tag' } }
            });

            isSuccess(res.json);

            const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
            expect(updatedConn?.tags).toStrictEqual({ first: 'tag' });
        });

        it('should allow empty tags object', async () => {
            const { env, secret } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

            await db
                .knex('_nango_connections')
                .where({ id: conn.id })
                .update({ tags: { existing: 'tag' } });

            const res = await api.fetch(endpoint, {
                method: 'PATCH',
                token: secret.secret,
                params: { connectionId: conn.connection_id },
                query: { provider_config_key: 'github' },
                body: { tags: {} }
            });

            isSuccess(res.json);

            const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
            expect(updatedConn?.tags).toStrictEqual({});
        });
    });
});
