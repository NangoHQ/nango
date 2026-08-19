import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sharedCredentialsService } from '@nangohq/shared';

import { envs } from '../../../env.js';
import { isError, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/internal/shared-credentials/:id';
const internalKey = 'test-internal-api-key';

describe(`PATCH ${endpoint}`, () => {
    const originalKey = envs.NANGO_INTERNAL_API_KEY;

    beforeAll(async () => {
        api = await runServer();
        envs.NANGO_INTERNAL_API_KEY = internalKey;
    });
    afterAll(() => {
        envs.NANGO_INTERNAL_API_KEY = originalKey;
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            params: { id: 1 },
            body: { name: 'github-app', client_id: 'id', client_secret: 'secret', app_link: 'https://github.com/apps/some-app' }
        });

        shouldBeProtected(res);
    });

    it('should update app_link for an APP-mode provider', async () => {
        const created = (
            await sharedCredentialsService.createSharedCredentials({
                name: 'github-app',
                client_id: 'app-id',
                client_secret: 'private-key',
                app_link: 'https://github.com/apps/original'
            })
        ).unwrap();

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: internalKey,
            params: { id: created },
            body: { name: 'github-app', client_id: 'app-id', client_secret: 'private-key', app_link: 'https://github.com/apps/updated' }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({ success: true });

        const fetched = (await sharedCredentialsService.getSharedCredentialsById(created)).unwrap();
        expect(fetched.credentials.app_link).toBe('https://github.com/apps/updated');
    });

    it('should reject a missing app_link for an APP-mode provider', async () => {
        const created = (
            await sharedCredentialsService.createSharedCredentials({
                name: 'github-app',
                client_id: 'app-id',
                client_secret: 'private-key',
                app_link: 'https://github.com/apps/original'
            })
        ).unwrap();

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: internalKey,
            params: { id: created },
            body: { name: 'github-app', client_id: 'app-id', client_secret: 'private-key' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'custom', message: 'app_link is required for providers with auth_mode APP', path: ['app_link'] }]
            }
        });
    });

    it('should reject an app_link for a non-APP-mode provider', async () => {
        const created = (
            await sharedCredentialsService.createSharedCredentials({
                name: 'github',
                client_id: 'client-id',
                client_secret: 'client-secret'
            })
        ).unwrap();

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: internalKey,
            params: { id: created },
            body: { name: 'github', client_id: 'client-id', client_secret: 'client-secret', app_link: 'https://example.com' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'custom', message: 'app_link is only supported for providers with auth_mode APP', path: ['app_link'] }]
            }
        });
    });
});
