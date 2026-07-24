import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { authenticateUser, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

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

    it('returns the audit-trail flag (off by default)', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        // @ts-expect-error type declares `env` but the controller rejects any query param
        const res = await api.fetch(route, { method: 'GET', session });
        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.auditTrail).toBe(false);
    });
});
