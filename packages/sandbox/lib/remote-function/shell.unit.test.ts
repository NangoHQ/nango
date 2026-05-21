import { describe, expect, it } from 'vitest';

import { buildShellCommand, quoteShellArg } from './shell.js';

describe('remote function shell helpers', () => {
    it('quotes single quotes safely', () => {
        expect(quoteShellArg("a'b")).toBe(`'a'"'"'b'`);
    });

    it('quotes all command arguments', () => {
        expect(buildShellCommand(['nango', 'dryrun', 'sync; rm -rf /'])).toBe(`'nango' 'dryrun' 'sync; rm -rf /'`);
    });
});
