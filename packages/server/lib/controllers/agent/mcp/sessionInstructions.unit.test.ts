import { describe, expect, it } from 'vitest';

import { buildSessionInstructions } from './sessionInstructions.js';

import type { AgentSession, AgentSessionMetaTools } from '@nangohq/types';

const ALL_META_TOOLS: AgentSessionMetaTools = {
    nangoToolSearch: true,
    nangoExecute: true,
    nangoProxy: true,
    nangoCreateConnection: { enabled: true, tags: {} }
};

const NO_META_TOOLS: AgentSessionMetaTools = {
    nangoToolSearch: false,
    nangoExecute: false,
    nangoProxy: false,
    nangoCreateConnection: { enabled: false, tags: {} }
};

function session({
    metaTools = ALL_META_TOOLS,
    compiledToolset = {},
    resolvedConnections = {}
}: Partial<Pick<AgentSession, 'metaTools' | 'compiledToolset' | 'resolvedConnections'>> = {}): AgentSession {
    return {
        id: 'session-1',
        environmentId: 1,
        accountId: 1,
        resolvedConnections,
        compiledToolset,
        metaTools,
        expiresAt: new Date(),
        endedAt: null,
        endedReason: null,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

describe('buildSessionInstructions', () => {
    it('names each integration by its id and says whether it is connected', () => {
        const instructions = buildSessionInstructions(
            session({
                compiledToolset: {
                    'pg-google-calendar': { provider: 'google-calendar', pinned: [], searchable: [] },
                    'pg-github': { provider: 'github', pinned: [], searchable: [] }
                },
                resolvedConnections: {
                    'pg-google-calendar': {
                        integrationId: 'pg-google-calendar',
                        provider: 'google-calendar',
                        connectionId: 'conn-1',
                        internalConnectionId: 1,
                        configId: 1
                    }
                }
            })
        );

        expect(instructions).toContain('- pg-github (github): not connected\n- pg-google-calendar (google-calendar): connected');
    });

    it('says so when the session has no integration', () => {
        expect(buildSessionInstructions(session())).toContain('This session has no integrations');
    });

    it('describes every meta tool the session has', () => {
        const instructions = buildSessionInstructions(session());

        expect(instructions).toContain('use nango_tool_search to find one');
        expect(instructions).toContain('Call a tool through nango_execute');
        expect(instructions).toContain("nango_proxy calls the app's API directly");
        expect(instructions).toContain('use it only when no tool covers the task, after searching.');
        expect(instructions).toContain('Call nango_create_connection for that integration');
    });

    it('never names a meta tool the session does not have', () => {
        const instructions = buildSessionInstructions(session({ metaTools: NO_META_TOOLS }));

        expect(instructions).not.toMatch(/nango_(tool_search|execute|proxy|create_connection)/);
        expect(instructions).toContain('Call a tool directly by its name.');
        expect(instructions).toContain('This session cannot connect an integration.');
    });

    it('does not send a search result to nango_execute when search is off', () => {
        const instructions = buildSessionInstructions(session({ metaTools: { ...ALL_META_TOOLS, nangoToolSearch: false } }));

        expect(instructions).toContain('Call a tool through nango_execute with its name exactly as listed, and its input.');
        expect(instructions).toContain('use it only when no tool covers the task.');
    });
});
