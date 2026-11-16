import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { productTracking, withProductTrackingContext } from '@nangohq/shared';

import { toolSearchTool } from './search.js';

import type { AgentSessionMcpContext } from '../sessionTool.js';
import type { AgentSession, DBEnvironment, DBTeam } from '@nangohq/types';

function context(): AgentSessionMcpContext {
    const session: AgentSession = {
        id: 'session-1',
        environmentId: 1,
        accountId: 1,
        resolvedConnections: {},
        compiledToolset: {},
        metaTools: { nangoToolSearch: true, nangoExecute: true, nangoProxy: true, nangoCreateConnection: { enabled: false, tags: {} } },
        expiresAt: new Date(),
        endedAt: null,
        endedReason: null,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    return {
        account: { id: 1 } as DBTeam,
        environment: { id: 42, name: 'dev' } as DBEnvironment,
        plan: null,
        session,
        callable: new Map()
    };
}

describe('toolSearchTool analytics', () => {
    const capture = vi.fn();
    const realClient = productTracking.client;

    beforeEach(() => {
        capture.mockClear();
        productTracking.client = { capture, groupIdentify: vi.fn() } as unknown as typeof productTracking.client;
    });

    afterEach(() => {
        productTracking.client = realClient;
    });

    async function searchInRequest(args: Record<string, unknown>) {
        return await withProductTrackingContext(
            () => ({ team: { id: 42, name: 'Acme' } as DBTeam }),
            async () => await toolSearchTool.handler(args, context())
        );
    }

    function onlyEvent() {
        expect(capture).toHaveBeenCalledTimes(1);
        return capture.mock.calls[0]![0] as { event: string; properties: Record<string, unknown> };
    }

    it('records a missing goal as the reason a search was rejected', async () => {
        await searchInRequest({ queries: ['list calendar events'] });

        expect(onlyEvent().properties).toMatchObject({ error_code: 'invalid_input', invalid_arguments: 'goal: invalid_type' });
    });

    it('records a search sent in the single query shape as rejected for both arguments', async () => {
        await searchInRequest({ query: 'list calendar events', goal: 'find a free slot for the meeting' });

        expect(onlyEvent().properties).toMatchObject({ error_code: 'invalid_input', invalid_arguments: 'queries: invalid_type, query: unrecognized_key' });
    });
});
