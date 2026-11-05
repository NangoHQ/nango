import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import * as agentGettingStartedService from '../../../services/agentGettingStarted.service.js';
import { AGENT_SESSION_TAG_KEY } from '../../../services/agentSessionConnections.service.js';
import { authenticateUser, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

const endpoint = '/api/v1/agent-getting-started/restart';
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

    it('clears the progress for the account', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        await agentGettingStartedService.recordConnectionCreated({ accountId: account.id, tags: { [AGENT_SESSION_TAG_KEY]: 'session-id' } });
        expect((await agentGettingStartedService.getStatus(db.knex, account.id)).first_agent_connection_at).not.toBeNull();
        const session = await authenticateUser(api, user);

        const res = await api.fetch(endpoint, { method: 'POST', session });

        isSuccess(res.json);
        expect(res.json.data.first_agent_connection_at).toBeNull();
    });
});
