import { describe, expect, it } from 'vitest';

import { buildInstructions } from './agentPlayground.instructions.js';

describe('buildInstructions', () => {
    it("states the time in the user's time zone", () => {
        const instructions = buildInstructions('Europe/Prague', new Date('2026-09-29T15:42:10Z'));

        expect(instructions).toContain("The user's time zone is Europe/Prague. It is currently Tuesday, 29 September 2026 at 17:42 there.");
    });

    it('names each integration by its id and says whether it is connected', () => {
        const instructions = buildInstructions('UTC', new Date('2026-09-29T15:00:00Z'), [
            { id: 'pg-github', provider: 'github', connected: false },
            { id: 'pg-google-calendar', provider: 'google-calendar', connected: true }
        ]);

        expect(instructions).toContain('- pg-github (github): not connected');
        expect(instructions).toContain('- pg-google-calendar (google-calendar): connected');
    });

    it('points an app the session does not have to the Integrations tab', () => {
        const instructions = buildInstructions('UTC', new Date('2026-09-29T15:00:00Z'));

        expect(instructions).toContain('they can add it in the Integrations tab if Nango supports it');
        expect(instructions).not.toContain('does not offer that app');
    });

    it('names the apps that are not set up yet, and says nothing when all are', () => {
        const withMissing = buildInstructions('UTC', new Date('2026-09-29T15:00:00Z'), [], ['Google Calendar']);
        const withoutMissing = buildInstructions('UTC', new Date('2026-09-29T15:00:00Z'), [], []);

        expect(withMissing).toContain('These apps are not set up in this environment yet: Google Calendar.');
        expect(withoutMissing).not.toContain('not set up in this environment yet');
    });

    it('says so when no integration is set up', () => {
        expect(buildInstructions('UTC', new Date('2026-09-29T15:00:00Z'))).toContain('No integrations are set up in this session right now.');
    });
});
