import { describe, expect, it } from 'vitest';

import { hasStarterPrompt, integrationPrompt, playgroundDraftState, readPlaygroundDraft } from './draft';

describe('integrationPrompt', () => {
    it("uses the provider's starter prompt", () => {
        expect(integrationPrompt({ provider: 'google-calendar', integrationName: 'My calendar' })).toBe("What's on my Google Calendar today?");
    });

    it('asks the agent to show what it can do when the provider has no starter prompt', () => {
        expect(integrationPrompt({ provider: 'unknown-api', integrationName: 'Unknown' })).toBe('Show me what you can do with my Unknown account');
    });
});

describe('readPlaygroundDraft', () => {
    it('reads a draft and its environment from router state', () => {
        expect(readPlaygroundDraft(playgroundDraftState('Hi', 'dev'))).toEqual({ text: 'Hi', env: 'dev' });
    });

    it('keeps the starter provider that sets up the integration', () => {
        expect(readPlaygroundDraft(playgroundDraftState('Hi', 'dev', 'linear'))).toEqual({ text: 'Hi', env: 'dev', starterProvider: 'linear' });
    });

    it('drops a starter provider that is not a string', () => {
        expect(readPlaygroundDraft({ playgroundDraft: { text: 'Hi', env: 'dev', starterProvider: 42 } })).toEqual({ text: 'Hi', env: 'dev' });
    });

    it('ignores any other state', () => {
        expect(readPlaygroundDraft(null)).toBeUndefined();
        expect(readPlaygroundDraft({ playgroundDraft: 'Hi' })).toBeUndefined();
        expect(readPlaygroundDraft({ playgroundDraft: { text: 'Hi' } })).toBeUndefined();
    });
});

describe('hasStarterPrompt', () => {
    it('is true only for providers with their own starter prompt', () => {
        expect(hasStarterPrompt('google-calendar')).toBe(true);
        expect(hasStarterPrompt('unknown-api')).toBe(false);
    });
});
