import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/connection';

describe(`GET ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'GET',
            query: {}
        });

        shouldBeProtected(res);
    });

    it('should list empty connections', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {}
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            connections: []
        });
    });

    it('should list one connection', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {}
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            connections: [
                {
                    connection_id: conn.connection_id,
                    created: expect.toBeIsoDateTimezone(),
                    end_user: null,
                    errors: [],
                    id: conn.id,
                    metadata: null,
                    provider: 'github',
                    provider_config_key: 'github',
                    tags: {}
                }
            ]
        });
    });

    it('should list connection with tags', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const conn = await seeders.createConnectionSeed({ env, provider: 'github', tags: { department: 'sales', tier: 'enterprise' } });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {}
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            connections: [
                {
                    connection_id: conn.connection_id,
                    created: expect.toBeIsoDateTimezone(),
                    end_user: null,
                    errors: [],
                    id: conn.id,
                    metadata: null,
                    provider: 'github',
                    provider_config_key: 'github',
                    tags: { department: 'sales', tier: 'enterprise' }
                }
            ]
        });
    });

    it('should filter connections by single tag', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const conn1 = await seeders.createConnectionSeed({
            env,
            provider: 'github',
            tags: { department: 'engineering,backend', env: 'production' }
        });
        await seeders.createConnectionSeed({ env, provider: 'github', tags: { department: 'sales', env: 'staging' } });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {
                tags: { department: 'engineering,backend' }
            }
        });

        isSuccess(res.json);
        expect(res.json.connections).toHaveLength(1);
        expect(res.json.connections[0]!.connection_id).toBe(conn1.connection_id);
    });

    it('should filter connections with manually built URL', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const conn1 = await seeders.createConnectionSeed({
            env,
            provider: 'github',
            tags: { department: 'engineering,backend', env: 'production' }
        });
        await seeders.createConnectionSeed({ env, provider: 'github', tags: { department: 'sales', env: 'staging' } });

        const params = new URLSearchParams();
        params.set('tags[department]', 'engineering,backend');
        params.set('tags[env]', 'production');
        const url = `${api.url}${endpoint}?${params.toString()}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${env.secret_key}` }
        });
        const json = await res.json();

        isSuccess(json);
        expect(json.connections).toHaveLength(1);
        expect(json.connections[0]!.connection_id).toBe(conn1.connection_id);
    });

    it('should filter connections by multiple tags (AND logic)', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const conn1 = await seeders.createConnectionSeed({ env, provider: 'github', tags: { department: 'engineering', env: 'production' } });
        await seeders.createConnectionSeed({ env, provider: 'github', tags: { department: 'engineering', env: 'staging' } });
        await seeders.createConnectionSeed({ env, provider: 'github', tags: { department: 'sales', env: 'production' } });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {
                tags: { department: 'engineering', env: 'production' }
            }
        });

        isSuccess(res.json);
        expect(res.json.connections).toHaveLength(1);
        expect(res.json.connections[0]!.connection_id).toBe(conn1.connection_id);
    });

    it('should return empty when no connections match tags', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        await seeders.createConnectionSeed({ env, provider: 'github', tags: { department: 'engineering' } });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {
                tags: { department: 'sales' }
            }
        });

        isSuccess(res.json);
        expect(res.json.connections).toHaveLength(0);
    });

    it('should not match when tag key exists but value differs', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        await seeders.createConnectionSeed({ env, provider: 'github', tags: { department: 'engineering' } });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {
                tags: { department: 'sales' }
            }
        });

        isSuccess(res.json);
        expect(res.json.connections).toHaveLength(0);
    });

    it('should return 400 when tag keys are invalid', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {
                tags: { '123invalid': 'value' }
            }
        });

        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_query_params',
                errors: [
                    {
                        code: 'invalid_key',
                        message: 'Invalid key in record',
                        path: ['tags', '123invalid']
                    }
                ]
            }
        });
    });

    it('should filter by tag values containing colons (e.g. IPv6)', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        // Tag values can contain colons (e.g., IPv6 addresses)
        const conn1 = await seeders.createConnectionSeed({ env, provider: 'github', tags: { ip: '2001:db8::1' } });
        await seeders.createConnectionSeed({ env, provider: 'github', tags: { ip: '192.168.1.1' } });

        // First colon separates key from value: ip:2001:db8::1 -> { ip: "2001:db8::1" }
        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {
                tags: { ip: '2001:db8::1' }
            }
        });

        isSuccess(res.json);
        expect(res.json.connections).toHaveLength(1);
        expect(res.json.connections[0]!.connection_id).toBe(conn1.connection_id);
    });

    it('should search connections', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        await seeders.createConnectionSeed({ env, provider: 'github' });
        const conn2 = await seeders.createConnectionSeed({ env, provider: 'github' });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {
                search: conn2.connection_id
            }
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject({
            connections: [{ connection_id: conn2.connection_id }]
        });
        expect(res.json.connections).toHaveLength(1);
    });

    it('should return end user', async () => {
        const { env, account } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const endUser = await seeders.createEndUser({ environment: env, account });
        const conn = await seeders.createConnectionSeed({ env, provider: 'github', endUser });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {}
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject({
            connections: [
                {
                    id: conn.id,
                    provider_config_key: 'github',
                    connection_id: conn.connection_id,
                    end_user: {
                        id: endUser.endUserId,
                        display_name: null,
                        email: endUser.email,
                        organization: { id: endUser.organization!.organizationId, display_name: endUser.organization!.displayName! }
                    }
                }
            ]
        });
        expect(res.json.connections).toHaveLength(1);
    });

    it('should filter one connection by non-existing endUserId', async () => {
        const { env, account } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const endUser = await seeders.createEndUser({ environment: env, account });
        await seeders.createConnectionSeed({ env, provider: 'github', endUser });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {
                endUserId: 'non-existing'
            }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual({
            connections: []
        });
    });

    it('should filter one connection by endUserId', async () => {
        const { env, account } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const endUser = await seeders.createEndUser({ environment: env, account });
        const conn = await seeders.createConnectionSeed({ env, provider: 'github', endUser });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {
                endUserId: endUser.endUserId
            }
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject({
            connections: [{ connection_id: conn.connection_id, end_user: { id: endUser.endUserId } }]
        });
    });

    it('should filter one connection by endUserOrganizationId', async () => {
        const { env, account } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const endUser = await seeders.createEndUser({ environment: env, account });
        const conn = await seeders.createConnectionSeed({ env, provider: 'github', endUser });

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {
                endUserOrganizationId: endUser.organization?.organizationId
            }
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject({
            connections: [{ connection_id: conn.connection_id, end_user: { id: endUser.endUserId } }]
        });
    });

    it('should be paginable', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        for (let i = 0; i < 5; i++) {
            await seeders.createConnectionSeed({ env, provider: 'github' });
        }

        const page0 = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {
                limit: 3
            }
        });

        isSuccess(page0.json);
        expect(page0.json.connections).toHaveLength(3);

        const page1 = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {
                limit: 3,
                page: 1
            }
        });

        isSuccess(page1.json);
        expect(page1.json.connections).toHaveLength(2);

        const page2 = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            query: {
                limit: 3,
                page: 2
            }
        });

        isSuccess(page2.json);
        expect(page2.json.connections).toHaveLength(0);
    });
});
