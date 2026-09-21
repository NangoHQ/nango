import { describe, expect, it } from 'vitest';

import { notConnectedGuidance } from './notConnectedGuidance.js';

import type { AgentSession, AgentSessionCreateConnectionConfig } from '@nangohq/types';

function session(nangoCreateConnection: AgentSessionCreateConnectionConfig): AgentSession {
    return {
        id: 'session-1',
        environmentId: 1,
        accountId: 1,
        resolvedConnections: {},
        compiledToolset: {},
        metaTools: { nangoToolSearch: true, nangoExecute: true, nangoProxy: false, nangoCreateConnection },
        expiresAt: new Date(),
        endedAt: null,
        endedReason: null,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

describe('notConnectedGuidance', () => {
    it('tells the agent to hand it over when it cannot connect anything', () => {
        const message = notConnectedGuidance('notion', session({ enabled: false, tags: {} }));

        expect(message).toBe('Nothing you can do from here will connect it. Tell the user they need to connect it, and carry on with the tools you do have.');
        expect(message).not.toContain('nango_create_connection');
    });

    it('points at the tool, naming the integration, when it can connect', () => {
        const message = notConnectedGuidance('notion', session({ enabled: true, tags: {} }));

        expect(message).toContain('nango_create_connection');
        expect(message).toContain("integration 'notion'");
    });
});
