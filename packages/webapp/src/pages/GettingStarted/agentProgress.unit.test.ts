import { describe, expect, it } from 'vitest';

import { deriveAgentProgress } from './agentProgress';

import type { ApiAgentGettingStarted } from '@nangohq/types';

const empty: ApiAgentGettingStarted = { first_agent_connection_at: null, first_tool_call_at: null, dismissed_at: null };
const at = '2026-11-03T10:00:00.000Z';

describe('deriveAgentProgress', () => {
    it('starts on install, with trying integrations upcoming', () => {
        expect(deriveAgentProgress({ progress: empty, promptCopied: false })).toStrictEqual({
            install: 'current',
            tryIntegrations: 'upcoming',
            hasConnection: false,
            hasToolCall: false,
            hasProgress: false
        });
    });

    it('counts install done once the prompt is copied', () => {
        const progress = deriveAgentProgress({ progress: empty, promptCopied: true });
        expect(progress.install).toBe('done');
        expect(progress.tryIntegrations).toBe('current');
        expect(progress.hasProgress).toBe(true);
    });

    it.each([
        ['a connection', { first_agent_connection_at: at }],
        ['a tool call', { first_tool_call_at: at }]
    ])('counts install done without a copy once there is %s', (_, stamped) => {
        expect(deriveAgentProgress({ progress: { ...empty, ...stamped }, promptCopied: false }).install).toBe('done');
    });

    it('keeps trying integrations current until both a connection and a tool call happened', () => {
        const progress = deriveAgentProgress({ progress: { ...empty, first_agent_connection_at: at }, promptCopied: false });
        expect(progress.tryIntegrations).toBe('current');
        expect(progress.hasConnection).toBe(true);
        expect(progress.hasToolCall).toBe(false);
    });

    it('marks trying integrations done after a connection and a tool call', () => {
        const progress = deriveAgentProgress({ progress: { ...empty, first_agent_connection_at: at, first_tool_call_at: at }, promptCopied: false });
        expect(progress.tryIntegrations).toBe('done');
    });
});
