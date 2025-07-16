import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { isError, runServer, shouldBeProtected } from '../../../utils/tests.js';

const route = '/api/v1/user';
let api: Awaited<ReturnType<typeof runServer>>;
describe(`PATCH ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'PATCH', body: { name: 'name' } });

        shouldBeProtected(res);
    });

    it('should enforce no query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'PATCH',
            token: env.secret_key,
            // @ts-expect-error on purpose
            query: { env: 'dev' },
            body: { name: 'name' }
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_query_params',
                errors: [{ code: 'unrecognized_keys', message: "Unrecognized key(s) in object: 'env'", path: [] }]
            }
        });
    });

    // TODO: can't test stuff that needs `user` because we are using an anonymous secret_key
    //     it('should patch a user', async () => {
    //         const { env, user, account } = await seeders.seedAccountEnvAndUser();

    //         const res = await api.fetch(route, {
    //             method: 'GET',
    //             token: env.secret_key
    //         });

    //         expect(res.res.status).toBe(200);
    //         isSuccess(res.json);
    //         expect(res.json).toStrictEqual<typeof res.json>({
    //             data: {}
    //         });
    //     });
});
