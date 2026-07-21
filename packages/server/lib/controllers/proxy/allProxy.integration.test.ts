import { Readable } from 'node:stream';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ProxyRequest, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

import type { InternalAxiosRequestConfig } from 'axios';

const route = '/proxy/:anyPath';

// Real octocat response from GET https://api.github.com/users/octocat, frozen as a fixture.
// The proxy's outbound HTTP call is mocked via `ProxyRequest.prototype.httpCall` (the seam it exposes
// for tests) instead of hitting the real GitHub API, which flaked in CI on shared-IP rate limiting.
const octocatFixture = {
    login: 'octocat',
    id: 583231,
    avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
    html_url: 'https://github.com/octocat',
    url: 'https://api.github.com/users/octocat',
    type: 'User',
    user_view_type: 'public',
    name: 'The Octocat',
    company: '@github',
    blog: 'https://github.blog',
    location: 'San Francisco',
    created_at: '2011-01-25T18:44:36Z'
};

function mockGithubUserResponse() {
    vi.spyOn(ProxyRequest.prototype, 'httpCall').mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        config: {} as InternalAxiosRequestConfig,
        data: Readable.from([Buffer.from(JSON.stringify(octocatFixture))])
    });
}

let api: Awaited<ReturnType<typeof runServer>>;
describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, {
            method: 'GET',
            headers: { 'connection-id': 't', 'provider-config-key': '' }
        });

        shouldBeProtected(res);
    });

    it('should require headers', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
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
        mockGithubUserResponse();
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, config_id: integration.id!, provider: 'github' });
        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
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
            user_view_type: 'public'
        });
    });

    it('should return 400 base_url_override_not_allowed when base-url-override host is denylisted', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, config_id: integration.id!, provider: 'github' });
        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { anyPath: 'users/octocat' },
            headers: {
                'connection-id': connection.connection_id,
                'provider-config-key': integration.unique_key,
                'base-url-override': 'https://denylisted-proxy-test.invalid'
            }
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual({
            error: {
                code: 'base_url_override_not_allowed',
                message: 'This base URL override is not allowed by server configuration.'
            }
        });
    });

    it.each(['/proxy?Param=IHaveNoPath', '/proxy/?Param=IHaveNoPath'])('should match proxy route for query-only path %s', async (path) => {
        const res = await fetch(`${api.url}${path}`, { method: 'GET' });
        const json = await res.json();

        shouldBeProtected({ res, json });
    });

    it('should use all the headers', async () => {
        mockGithubUserResponse();
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, config_id: integration.id!, provider: 'github' });
        const res = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
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
