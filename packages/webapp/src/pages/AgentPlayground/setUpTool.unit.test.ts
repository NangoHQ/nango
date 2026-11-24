import { describe, expect, it } from 'vitest';

import { continueOncePerSetUp, createdIntegrationIds, providersToAdd } from './setUpTool';

import type { PlaygroundMessage } from '@/store/agentPlaygroundChat';
import type { AgentPlaygroundIntegrationSetup } from '@nangohq/types';

const setUpPart = (setups: AgentPlaygroundIntegrationSetup[]): PlaygroundMessage['parts'][number] => ({
    type: 'dynamic-tool',
    toolName: 'set_up_integrations',
    toolCallId: 'call-1',
    state: 'output-available',
    input: { apps: setups.map((setup) => setup.provider) },
    output: { setups }
});

const reply = (parts: PlaygroundMessage['parts']): PlaygroundMessage[] => [
    { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Find my flights in Gmail' }] },
    { id: 'reply', role: 'assistant', parts }
];

const continuesAfterSetUp = (options: { messages: PlaygroundMessage[] }) => continueOncePerSetUp()(options);

describe('continuesAfterSetUp', () => {
    it('continues when another tool ran in the same step as the setup', () => {
        const messages = reply([
            { type: 'step-start' },
            setUpPart([{ provider: 'linear', integrationId: 'linear', outcome: 'created' }]),
            { type: 'dynamic-tool', toolName: 'nango_tool_search', toolCallId: 'call-2', state: 'output-available', input: {}, output: {} }
        ]);

        expect(continuesAfterSetUp({ messages })).toBe(true);
    });

    it('waits while another tool in the same step awaits the user’s approval', () => {
        const messages = reply([
            { type: 'step-start' },
            setUpPart([{ provider: 'linear', integrationId: 'linear', outcome: 'created' }]),
            { type: 'dynamic-tool', toolName: 'nango_proxy', toolCallId: 'call-2', state: 'approval-requested', input: {}, approval: { id: 'approval-2' } }
        ]);

        expect(continuesAfterSetUp({ messages })).toBe(false);
    });

    it('continues only once per setup, even when the continuation adds nothing', () => {
        const continues = continueOncePerSetUp();
        const messages = reply([{ type: 'step-start' }, setUpPart([{ provider: 'linear', integrationId: 'linear', outcome: 'created' }])]);

        expect(continues({ messages })).toBe(true);
        expect(continues({ messages })).toBe(false);
    });

    it('does not continue from a setup in an earlier step', () => {
        const messages = reply([
            { type: 'step-start' },
            setUpPart([{ provider: 'linear', integrationId: 'linear', outcome: 'created' }]),
            { type: 'step-start' },
            { type: 'dynamic-tool', toolName: 'nango_tool_search', toolCallId: 'call-2', state: 'output-available', input: {}, output: {} }
        ]);

        expect(continuesAfterSetUp({ messages })).toBe(false);
    });

    it('continues once an app is set up', () => {
        const messages = reply([
            { type: 'step-start' },
            setUpPart([{ provider: 'google-mail', integrationId: 'pg-google-mail', outcome: 'created' }]),
            { type: 'step-start' }
        ]);

        expect(continuesAfterSetUp({ messages })).toBe(true);
    });

    it('waits for the user while an app still needs adding, even when others were added', () => {
        const messages = reply([
            setUpPart([
                { provider: 'resend', integrationId: 'pg-resend', outcome: 'created' },
                { provider: 'outlook', outcome: 'needs_developer_app' }
            ])
        ]);

        expect(continuesAfterSetUp({ messages })).toBe(false);
    });

    it('does not continue when every app was already there, since the agent carried on in the same turn', () => {
        const messages = reply([setUpPart([{ provider: 'google-mail', integrationId: 'pg-google-mail', outcome: 'existing' }])]);

        expect(continuesAfterSetUp({ messages })).toBe(false);
    });

    it('waits for the user when nothing could be set up', () => {
        const messages = reply([setUpPart([{ provider: 'hubspot', outcome: 'not_created' }])]);

        expect(continuesAfterSetUp({ messages })).toBe(false);
    });

    it('does not continue on its own while an app still needs adding', () => {
        const messages = reply([setUpPart([{ provider: 'outlook', outcome: 'needs_developer_app' }])]);

        expect(continuesAfterSetUp({ messages })).toBe(false);
        expect(providersToAdd(messages.at(-1))).toEqual(['outlook']);
    });

    it('lists the app a starter prompt could not add', () => {
        const starter: PlaygroundMessage = {
            id: 'starter',
            role: 'assistant',
            parts: [],
            metadata: { integrationSetup: { provider: 'hubspot', outcome: 'not_created' } }
        };

        expect(providersToAdd(starter)).toEqual(['hubspot']);
    });

    it('lists only the apps still to add, never a user message', () => {
        const messages = reply([
            setUpPart([
                { provider: 'resend', integrationId: 'pg-resend', outcome: 'created' },
                { provider: 'outlook', outcome: 'needs_developer_app' },
                { provider: 'outlook', outcome: 'needs_developer_app' }
            ])
        ]);

        expect(providersToAdd(messages.at(-1))).toEqual(['outlook']);
        expect(providersToAdd(messages[0])).toEqual([]);
    });

    it('does not continue again once the agent has replied after the setup', () => {
        const messages = reply([
            { type: 'step-start' },
            setUpPart([{ provider: 'google-mail', integrationId: 'pg-google-mail', outcome: 'created' }]),
            { type: 'step-start' },
            { type: 'text', text: 'Connect Gmail.' }
        ]);

        expect(continuesAfterSetUp({ messages })).toBe(false);
    });
});

describe('createdIntegrationIds', () => {
    it('lists only the integrations a setup created', () => {
        const messages = reply([
            setUpPart([
                { provider: 'google-mail', integrationId: 'pg-google-mail', outcome: 'created' },
                { provider: 'resend', integrationId: 'pg-resend', outcome: 'existing' },
                { provider: 'outlook', outcome: 'needs_developer_app' }
            ])
        ]);

        expect(createdIntegrationIds(messages)).toEqual(['pg-google-mail']);
    });
});
