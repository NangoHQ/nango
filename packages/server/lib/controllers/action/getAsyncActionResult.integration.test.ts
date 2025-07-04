import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isError, runServer, shouldBeProtected } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/action/:id';

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
            params: { id: '00000000-0000-0000-0000-000000000000' }
        });

        shouldBeProtected(res);
    });

    it('should validate request', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: env.secret_key,
            params: { id: 'not-uuid' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_uri_params',
                errors: [
                    {
                        code: 'invalid_string',
                        message: 'Invalid uuid',
                        path: ['id']
                    }
                ]
            }
        });
    });
});
