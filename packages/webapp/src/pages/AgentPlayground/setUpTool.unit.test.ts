import { describe, expect, it } from 'vitest';

import { continuesAfterSetUp, providersToAdd } from './setUpTool';

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

describe('continuesAfterSetUp', () => {
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
            setUpPart([{ provider: 'google-mail', integrationId: 'pg-google-mail', outcome: 'created' }]),
            { type: 'text', text: 'Connect Gmail.' }
        ]);

        expect(continuesAfterSetUp({ messages })).toBe(false);
    });
});
