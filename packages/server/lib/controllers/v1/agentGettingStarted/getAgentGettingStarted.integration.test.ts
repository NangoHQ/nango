import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import * as agentGettingStartedService from '../../../services/agentGettingStarted.service.js';
import { authenticateUser, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

import type { AgentSession } from '@nangohq/types';

const endpoint = '/api/v1/agent-getting-started';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`GET ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, { method: 'GET' });
        shouldBeProtected(res);
    });

    it("returns the account's progress", async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        const session = { metaTools: { nangoCreateConnection: { enabled: true, tags: {} } } } as unknown as AgentSession;
        await agentGettingStartedService.recordToolCall({ accountId: account.id, session, succeeded: true });
        const webSession = await authenticateUser(api, user);

        const res = await api.fetch(endpoint, { method: 'GET', session: webSession });

        isSuccess(res.json);
        expect(res.json.data).toStrictEqual({
            first_agent_connection_at: null,
            first_tool_call_at: expect.any(String),
            dismissed_at: null
        });
    });
});
