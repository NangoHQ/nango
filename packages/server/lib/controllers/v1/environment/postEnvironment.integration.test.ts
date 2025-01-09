import { afterAll, beforeAll, describe, it } from 'vitest';
import { runServer, shouldBeProtected } from '../../../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/environments';

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
            body: { name: 'test' }
        });

        shouldBeProtected(res);
    });

    // Does not work because we only have env secret key for authentication but we actually want to create an env
    // it('should create an environment', async () => {
    //     const { account } = await seeders.seedAccountEnvAndUser();

    //     const res = await api.fetch(endpoint, {
    //         method: 'POST',
    //         body: { name: 'test', accountId: account.id }
    //     });

    //     isSuccess(res.json);
    //     expect(res.json).toStrictEqual<typeof res.json>({
    //         data: { id: expect.any(Number), name: 'test' }
    //     });
    // });
});
