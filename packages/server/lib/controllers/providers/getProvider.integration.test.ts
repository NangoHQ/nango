import { multipleMigrations } from '@nangohq/database';
import { seeders } from '@nangohq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

const route = '/providers/:provider';
let api: Awaited<ReturnType<typeof runServer>>;
describe(`GET ${route}`, () => {
    beforeAll(async () => {
        await multipleMigrations();
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'GET', params: { provider: 'hubspot' } });

        shouldBeProtected(res);
    });

    it('should get one', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            token: env.secret_key,
            params: { provider: 'hubspot' }
        });

        isSuccess(res.json);
        expect(res.json).toMatchObject<typeof res.json>({
            data: {
                name: 'hubspot',
                auth_mode: 'OAUTH2'
            }
        });
    });

    it('should return 404', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            token: env.secret_key,
            params: { provider: 'foobar' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'not_found', message: 'Unknown provider' }
        });
    });
});
