import { describe, expect, it } from 'vitest';

import { buildInstructions } from './agentPlayground.instructions.js';

describe('buildInstructions', () => {
    it("states the time in the user's time zone", () => {
        const instructions = buildInstructions('Europe/Prague', new Date('2026-09-29T15:42:10Z'), undefined);

        expect(instructions).toContain("The user's time zone is Europe/Prague. It is currently Tuesday, 29 September 2026 at 17:42 there.");
    });

    it("puts the session's instructions before the playground rules", () => {
        const instructions = buildInstructions('UTC', new Date('2026-09-29T15:00:00Z'), '# Nango agent session');

        expect(instructions.indexOf('# Nango agent session')).toBeGreaterThan(-1);
        expect(instructions.indexOf('# Nango agent session')).toBeLessThan(instructions.indexOf('# Nango Agent Playground'));
    });

    it('names the apps that are not set up yet, and says nothing when all are', () => {
        const withMissing = buildInstructions('UTC', new Date('2026-09-29T15:00:00Z'), undefined, ['Google Calendar']);
        const withoutMissing = buildInstructions('UTC', new Date('2026-09-29T15:00:00Z'), undefined, []);

        expect(withMissing).toContain('These apps are not set up in this environment yet: Google Calendar.');
        expect(withoutMissing).not.toContain('not set up in this environment yet');
    });
});
