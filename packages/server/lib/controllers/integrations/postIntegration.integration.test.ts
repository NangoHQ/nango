import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/integrations';

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
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: { provider: 'invalid', uniqueKey: '1832_@$ùé&', displayName: false, credentials: { authType: 'INVALID' } }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_string', message: 'Invalid', path: ['uniqueKey'] },
                    { code: 'invalid_type', message: 'Expected string, received boolean', path: ['displayName'] },
                    { code: 'invalid_union_discriminator', message: 'invalid credentials object', path: ['credentials', 'authType'] }
                ]
            }
        });
    });

    it('should validate the provider', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: { provider: 'invalid', unique_key: 'foobar' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'invalid_body', errors: [{ code: 'invalid_string', message: 'Invalid provider', path: ['uniqueKey'] }] }
        });
    });

    it('should create an integration', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
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
                updated_at: expect.toBeIsoDate()
            }
        });
    });
});
