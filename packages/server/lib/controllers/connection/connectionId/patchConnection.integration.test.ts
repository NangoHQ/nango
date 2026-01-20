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
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: env.secret_key,
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
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: env.secret_key,
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
            const { env } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

            const res = await api.fetch(endpoint, {
                method: 'PATCH',
                token: env.secret_key,
                params: { connectionId: conn.connection_id },
                query: { provider_config_key: 'github' },
                body: {
                    end_user: { id: 'user-123', email: 'test@example.com', display_name: 'Test User' }
                }
            });

            isSuccess(res.json);
            expect(res.json).toStrictEqual({ success: true });

            // Verify end_user was linked
            const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
            expect(updatedConn?.end_user_id).not.toBeNull();
        });
    });

    describe('tags', () => {
        it('should update tags only', async () => {
            const { env } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

            const tags = { projectId: '123', orgId: '456' };
            const res = await api.fetch(endpoint, {
                method: 'PATCH',
                token: env.secret_key,
                params: { connectionId: conn.connection_id },
                query: { provider_config_key: 'github' },
                body: { tags }
            });

            isSuccess(res.json);
            expect(res.json).toStrictEqual({ success: true });

            // Verify tags were updated in DB
            const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
            expect(updatedConn?.tags).toStrictEqual(tags);
        });

        it('should update both tags and end_user', async () => {
            const { env } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

            const tags = { env: 'production' };
            const res = await api.fetch(endpoint, {
                method: 'PATCH',
                token: env.secret_key,
                params: { connectionId: conn.connection_id },
                query: { provider_config_key: 'github' },
                body: {
                    tags,
                    end_user: { id: 'user-456' }
                }
            });

            isSuccess(res.json);
            expect(res.json).toStrictEqual({ success: true });

            // Verify both were updated
            const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
            expect(updatedConn?.tags).toStrictEqual(tags);
            expect(updatedConn?.end_user_id).not.toBeNull();
        });

        it('should fail with invalid tag key format', async () => {
            const { env } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

            const res = await api.fetch(endpoint, {
                method: 'PATCH',
                token: env.secret_key,
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

        it('should fail with invalid tag value format', async () => {
            const { env } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

            const res = await api.fetch(endpoint, {
                method: 'PATCH',
                token: env.secret_key,
                params: { connectionId: conn.connection_id },
                query: { provider_config_key: 'github' },
                body: {
                    tags: { key: 'value with spaces' }
                }
            });

            isError(res.json);
            expect(res.json).toMatchObject({
                error: { code: 'invalid_body' }
            });
            expect(res.res.status).toBe(400);
        });

        it('should replace existing tags completely', async () => {
            const { env } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

            // Set initial tags
            await db
                .knex('_nango_connections')
                .where({ id: conn.id })
                .update({ tags: { old: 'value', keep: 'this' } });

            // Update with new tags (should replace, not merge)
            const newTags = { new: 'value' };
            const res = await api.fetch(endpoint, {
                method: 'PATCH',
                token: env.secret_key,
                params: { connectionId: conn.connection_id },
                query: { provider_config_key: 'github' },
                body: { tags: newTags }
            });

            isSuccess(res.json);

            // Verify old tags are gone
            const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
            expect(updatedConn?.tags).toStrictEqual(newTags);
            expect(updatedConn?.tags).not.toHaveProperty('old');
            expect(updatedConn?.tags).not.toHaveProperty('keep');
        });

        it('should set tags on connection without existing tags', async () => {
            const { env } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

            // Verify connection starts with null tags
            const beforeConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
            expect(beforeConn?.tags).toBeNull();

            const tags = { first: 'tag' };
            const res = await api.fetch(endpoint, {
                method: 'PATCH',
                token: env.secret_key,
                params: { connectionId: conn.connection_id },
                query: { provider_config_key: 'github' },
                body: { tags }
            });

            isSuccess(res.json);

            const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
            expect(updatedConn?.tags).toStrictEqual(tags);
        });

        it('should allow empty tags object', async () => {
            const { env } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');
            const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

            // Set initial tags
            await db
                .knex('_nango_connections')
                .where({ id: conn.id })
                .update({ tags: { existing: 'tag' } });

            // Update with empty tags
            const res = await api.fetch(endpoint, {
                method: 'PATCH',
                token: env.secret_key,
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
