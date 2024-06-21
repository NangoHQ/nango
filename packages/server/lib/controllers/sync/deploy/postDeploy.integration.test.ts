import { multipleMigrations } from '@nangohq/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isError, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';
import { seeders } from '@nangohq/shared';
import { envs } from '@nangohq/logs';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/sync/deploy';

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        await multipleMigrations();
        api = await runServer();
        envs.NANGO_LOGS_ENABLED = false;
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            // @ts-expect-error don't care
            body: {}
        });

        shouldBeProtected(res);
    });

    it('should validate body', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                // @ts-expect-error on purpose
                debug: 'er'
            }
        });

        isError(res.json);

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [
                    {
                        code: 'invalid_type',
                        message: 'Required',
                        path: ['flowConfigs']
                    },
                    {
                        code: 'invalid_type',
                        message: 'Required',
                        path: ['postConnectionScriptsByProvider']
                    },
                    {
                        code: 'invalid_type',
                        message: 'Required',
                        path: ['nangoYamlBody']
                    },
                    {
                        code: 'invalid_type',
                        message: 'Required',
                        path: ['reconcile']
                    },
                    {
                        code: 'invalid_type',
                        message: 'Expected boolean, received string',
                        path: ['debug']
                    }
                ]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should accept empty body', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: env.secret_key,
            body: {
                debug: false,
                flowConfigs: [],
                nangoYamlBody: '',
                postConnectionScriptsByProvider: [],
                reconcile: false,
                singleDeployMode: false
            }
        });

        isSuccess(res.json);

        expect(res.json).toStrictEqual<typeof res.json>([]);
        expect(res.res.status).toBe(200);
    });
});
