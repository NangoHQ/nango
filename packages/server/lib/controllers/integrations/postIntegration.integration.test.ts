import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { getActionsByProviderConfigKey, seeders } from '@nangohq/shared';
import { Err, getLogger } from '@nangohq/utils';

import integrationService, { IntegrationServiceError } from '../../services/integration.service.js';
import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/integrations';
const getEndpoint = '/integrations/:uniqueKey';

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            // @ts-expect-error on purpose
            body: { provider: 'github' }
        });

        shouldBeProtected(res);
    });

    it('should validate the body', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            // @ts-expect-error on purpose
            body: { provider: 'invalid', unique_key: '1832_@$ùé&', display_name: false, credentials: { authType: 'INVALID' } }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_format', message: 'Invalid string: must match pattern /^[a-zA-Z0-9~:.@ _-]+$/', path: ['unique_key'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received boolean', path: ['display_name'] },
                    { code: 'invalid_union', message: 'invalid credentials object', path: ['credentials', 'type'] }
                ]
            }
        });
    });

    it('should validate the provider', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: { provider: 'invalid', unique_key: 'foobar' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', errors: [{ code: 'invalid_string', message: 'Invalid provider', path: ['provider'] }] }
        });
    });

    it('returns a server error and logs an unexpected service error code', async () => {
        const serviceError = new IntegrationServiceError({ code: 'create_failed', message: 'sensitive internal error' });
        Object.assign(serviceError, { code: 'unexpected_code' });
        const createSpy = vi.spyOn(integrationService, 'create').mockResolvedValueOnce(Err(serviceError));

        const controllerLogger = getLogger('Server.PostIntegration');
        let errorPrototype: object = controllerLogger;
        while (errorPrototype && !Object.prototype.hasOwnProperty.call(errorPrototype, 'error')) {
            errorPrototype = Object.getPrototypeOf(errorPrototype) as object;
        }
        const errorSpy = vi.spyOn(errorPrototype as { error: (...args: unknown[]) => unknown }, 'error').mockImplementation(() => undefined);

        try {
            const { apiKey } = await seeders.seedAccountEnvAndUser();
            const res = await api.fetch(endpoint, {
                method: 'POST',
                token: apiKey.secret,
                body: { provider: 'algolia', unique_key: 'foobar' }
            });

            expect(res.res.status).toBe(500);
            expect(res.json).toStrictEqual({ error: { code: 'server_error', message: 'Failed to create integration' } });

            const unexpectedCodeLog = errorSpy.mock.calls.find((call) => call[0] === 'Unexpected IntegrationService error code while creating integration');
            expect(unexpectedCodeLog).toStrictEqual(['Unexpected IntegrationService error code while creating integration', { code: 'unexpected_code' }]);
            expect(JSON.stringify(unexpectedCodeLog)).not.toContain('sensitive internal error');
        } finally {
            createSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });

    it('should create an integration', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: { provider: 'algolia', unique_key: 'foobar' }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                created_at: expect.toBeIsoDate(),
                display_name: 'Algolia',
                logo: 'http://localhost:3003/images/template-logos/algolia.svg',
                provider: 'algolia',
                unique_key: 'foobar',
                updated_at: expect.toBeIsoDate(),
                forward_webhooks: true
            }
        });
    });

    it('should add webhookSecret when creds.webhook_secret is present', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                provider: 'github',
                unique_key: 'github',
                credentials: {
                    type: 'OAUTH2',
                    client_id: 'client-id',
                    client_secret: 'client-secret',
                    scopes: 'scope',
                    webhook_secret: 'new_secret'
                }
            }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                created_at: expect.toBeIsoDate(),
                display_name: 'GitHub (User OAuth)',
                logo: 'http://localhost:3003/images/template-logos/github.svg',
                provider: 'github',
                unique_key: 'github',
                updated_at: expect.toBeIsoDate(),
                forward_webhooks: true
            }
        });

        const resGet = await api.fetch(getEndpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { uniqueKey: 'github' },
            query: { include: ['credentials'] }
        });

        isSuccess(resGet.json);
        const credentials = resGet.json.data.credentials as { webhook_secret: string | null };
        expect(credentials.webhook_secret).toBe('new_secret');
    });

    it('should not add webhookSecret when creds.webhook_secret is not present', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                provider: 'github',
                unique_key: 'github',
                credentials: {
                    type: 'OAUTH2',
                    client_id: 'client-id',
                    client_secret: 'client-secret',
                    scopes: 'scope'
                }
            }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                created_at: expect.toBeIsoDate(),
                display_name: 'GitHub (User OAuth)',
                logo: 'http://localhost:3003/images/template-logos/github.svg',
                provider: 'github',
                unique_key: 'github',
                updated_at: expect.toBeIsoDate(),
                forward_webhooks: true
            }
        });

        const resGet = await api.fetch(getEndpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { uniqueKey: 'github' },
            query: { include: ['credentials'] }
        });

        isSuccess(resGet.json);
        const credentials = resGet.json.data.credentials as { webhook_secret: string | null };
        expect(credentials.webhook_secret).toBeNull();
    });

    it('should auto-deploy catalog actions when the integration is created', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: { provider: 'bitdefender', unique_key: 'bitdefender-actions' }
        });

        isSuccess(res.json);
        const actions = await getActionsByProviderConfigKey(env.id, 'bitdefender-actions');
        expect(actions).toHaveLength(1);
        expect(actions[0]).toMatchObject({
            sync_name: 'get-company-details',
            type: 'action',
            source: 'catalog',
            enabled: true
        });
    });
});
