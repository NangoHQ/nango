import { afterAll, beforeAll, describe, it } from 'vitest';

import { runServer, shouldBeProtected } from '../../../utils/tests.js';

const route = '/api/v1/meta';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        // @ts-expect-error type declares `env` but the controller rejects any query param
        const res = await api.fetch(route, { method: 'GET' });
        shouldBeProtected(res);
    });
});
