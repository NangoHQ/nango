import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, it } from 'vitest';

import { runServer, shouldBeProtected } from '../../../utils/tests.js';

const route = '/api/v1/invite/:id';

let api: Awaited<ReturnType<typeof runServer>>;

describe(`POST ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        // @ts-expect-error duplicate GET/POST path confuses api.fetch endpoint inference
        const res = await api.fetch(route, { method: 'POST', params: { id: crypto.randomUUID() } });

        shouldBeProtected(res);
    });
});
