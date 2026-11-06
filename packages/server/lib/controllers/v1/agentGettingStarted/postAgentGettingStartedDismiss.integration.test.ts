import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { authenticateUser, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

const endpoint = '/api/v1/agent-getting-started/dismiss';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, { method: 'POST' });
        shouldBeProtected(res);
    });

    it('hides getting started for everyone in the account', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        const teammate = await seeders.seedUser(account.id);
        const session = await authenticateUser(api, user);

        const res = await api.fetch(endpoint, { method: 'POST', session });

        isSuccess(res.json);
        expect(res.json.data.dismissed_at).toEqual(expect.any(String));

        const teammateSession = await authenticateUser(api, teammate);
        // @ts-expect-error type declares `env` but the controller rejects any query param
        const meta = await api.fetch('/api/v1/meta', { method: 'GET', session: teammateSession });
        isSuccess(meta.json);
        expect(meta.json.data.gettingStartedDismissed).toBe(true);
    });
});
