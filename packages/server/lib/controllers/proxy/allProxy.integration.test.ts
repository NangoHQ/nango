import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

const route = '/proxy/:anyPath';

let api: Awaited<ReturnType<typeof runServer>>;
describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, {
            method: 'GET',
            headers: { 'connection-id': 't', 'provider-config-key': '' }
        });

        shouldBeProtected(res);
    });

    it('should require headers', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'GET',
            token: env.secret_key,
            // @ts-expect-error on purpose
            headers: {}
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_headers',
                errors: [
                    {
                        code: 'invalid_type',
                        message: 'Invalid input: expected string, received undefined',
                        path: ['provider-config-key']
                    },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['connection-id'] }
                ]
            }
        });
    });

    it('should call the proxy', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, config_id: integration.id!, provider: 'github' });
        const res = await api.fetch(route, {
            method: 'GET',
            token: env.secret_key,
            params: { anyPath: 'users/octocat' },
            headers: { 'connection-id': connection.connection_id, 'provider-config-key': integration.unique_key }
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject({
            avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
            blog: 'https://github.blog',
            company: '@github',
            created_at: '2011-01-25T18:44:36Z',
            html_url: 'https://github.com/octocat',
            id: 583231,
            location: 'San Francisco',
            login: 'octocat',
            name: 'The Octocat',
            type: 'User',
            url: 'https://api.github.com/users/octocat',
            user_view_type: 'public'
        });
    });

    it('should use all the headers', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, config_id: integration.id!, provider: 'github' });
        const res = await api.fetch(route, {
            method: 'GET',
            token: env.secret_key,
            params: { anyPath: 'users/octocat' },
            headers: {
                'connection-id': connection.connection_id,
                'provider-config-key': integration.unique_key,
                'nango-is-sync': 'true',
                'nango-is-dry-run': 'true',
                'nango-activity-log-id': '123',
                retries: 1,
                'base-url-override': 'https://api.github.com',
                decompress: 'true',
                'retry-on': '1,2,3',
                'x-custom': 'custom-value'
            } as any
        });

        isSuccess(res.json);
    });
});
