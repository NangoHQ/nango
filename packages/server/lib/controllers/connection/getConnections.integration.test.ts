import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { runServer, shouldBeProtected, isSuccess } from '../../utils/tests.js';
import { seeders } from '@nangohq/shared';

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
                    id: conn.id!,
                    metadata: null,
                    provider: 'github',
                    provider_config_key: 'github'
                }
            ]
        });
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
                    id: conn.id!,
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
});
