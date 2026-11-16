import { describe, expect, it } from 'vitest';

import { integrationPrompt, readPlaygroundDraft } from './draft';

describe('integrationPrompt', () => {
    it("uses the provider's starter prompt", () => {
        expect(integrationPrompt({ provider: 'google-calendar', integrationName: 'My calendar' })).toBe("What's on my Google Calendar today?");
    });

    it('asks the agent to show what it can do when the provider has no starter prompt', () => {
        expect(integrationPrompt({ provider: 'unknown-api', integrationName: 'Unknown' })).toBe('Show me what you can do with my Unknown account');
    });
});

describe('readPlaygroundDraft', () => {
    it('reads a draft from router state', () => {
        expect(readPlaygroundDraft({ playgroundDraft: 'Hi' })).toBe('Hi');
    });

    it('ignores any other state', () => {
        expect(readPlaygroundDraft(null)).toBeUndefined();
        expect(readPlaygroundDraft({ playgroundDraft: 1 })).toBeUndefined();
    });
});
