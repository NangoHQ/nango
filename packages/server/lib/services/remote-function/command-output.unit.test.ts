import { describe, expect, it } from 'vitest';

import { combineCommandOutput, getCommandOutput } from './command-output.js';

describe('remote function command output helpers', () => {
    it('preserves stdout and stderr when both contain useful diagnostics', () => {
        expect(
            combineCommandOutput({
                stdout: 'full diagnostic\n  at file.ts:1:1\n',
                stderr: 'Found 1 error\n'
            })
        ).toBe('full diagnostic\n  at file.ts:1:1\nFound 1 error');
    });

    it('deduplicates identical streams', () => {
        expect(
            combineCommandOutput({
                stdout: 'same error\n',
                stderr: 'same error\n'
            })
        ).toBe('same error');
    });

    it('falls back to the error message when streams are empty', () => {
        expect(getCommandOutput({ message: 'command failed' }, 'fallback')).toBe('command failed');
    });
});
