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
                        { code: 'invalid_format', message: 'Invalid string: must match pattern /^[a-zA-Z0-9_-]+$/', path: ['sync_name'] },
                        { code: 'invalid_format', message: 'Invalid string: must match pattern /^[a-zA-Z0-9_-]+$/', path: ['sync_variant'] },
                        { code: 'invalid_format', message: 'Invalid string: must match pattern /^[a-zA-Z0-9~:.@ _-]+$/', path: ['provider_config_key'] },
                        {
                            code: 'invalid_format',
                            message: 'Invalid string: must match pattern /^[a-zA-Z0-9,.;:=+~[\\]|@${}"\'\\\\/_ -]+$/',
                            path: ['connection_id']
                        },
                        {
                            code: 'invalid_format',
                            message:
                                'Invalid string: must match pattern /^(?<every>every )?((?<amount>[0-9]+)?\\s?(?<unit>(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?))|(?<unit2>(month|week|half day|half hour|quarter hour)))$/',
                            path: ['frequency']
                        }
                    ]
                }
            });
        });
    });
});
