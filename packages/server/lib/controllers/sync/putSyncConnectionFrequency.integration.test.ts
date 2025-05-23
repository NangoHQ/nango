import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { envs } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';

import { runServer, shouldBeProtected } from '../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/sync/update-connection-frequency';

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
        envs.NANGO_LOGS_ENABLED = false;
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'PUT',
            // @ts-expect-error don't care
            body: {}
        });

        shouldBeProtected(res);
    });

    describe('validation', () => {
        it('should return 400 for for invalid body', async () => {
            const { env } = await seeders.seedAccountEnvAndUser();

            const res = await api.fetch(endpoint, {
                method: 'PUT',
                token: env.secret_key,
                body: {
                    connection_id: 'a1-£$',
                    frequency: 'foobar',
                    provider_config_key: '_FEIJàé-°',
                    sync_name: '1_°3094',
                    sync_variant: '1%¨30_'
                },
                headers: {}
            });

            expect(res.res.status).toEqual(400);
            expect(res.json).toStrictEqual({
                error: {
                    code: 'invalid_body',
                    errors: [
                        { code: 'invalid_string', message: 'Invalid', path: ['sync_name'], validation: 'regex' },
                        { code: 'invalid_string', message: 'Invalid', path: ['sync_variant'], validation: 'regex' },
                        { code: 'invalid_string', message: 'Invalid', path: ['provider_config_key'], validation: 'regex' },
                        { code: 'invalid_string', message: 'Invalid', path: ['connection_id'], validation: 'regex' },
                        { code: 'invalid_string', message: 'Invalid', path: ['frequency'], validation: 'regex' }
                    ]
                }
            });
        });
    });
});
