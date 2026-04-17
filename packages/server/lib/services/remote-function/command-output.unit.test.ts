import { describe, expect, it } from 'vitest';

import {
    combineCommandOutput,
    getCommandOutput,
    getDryrunCommandErrorOutput,
    getDryrunCommandSuccessOutput,
    isCompilationFailureOutput,
    parseDeploySuccessOutput,
    parseDryrunSuccessOutput
} from './command-output.js';

describe('remote function command output helpers', () => {
    describe('getCommandOutput', () => {
        it('falls back to the error message when streams are empty', () => {
            expect(getCommandOutput({ message: 'command failed' }, 'fallback')).toBe('command failed');
        });
    });

    describe('combineCommandOutput', () => {
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
    });

    describe('isCompilationFailureOutput', () => {
        it('detects typecheck failures in command output', () => {
            expect(isCompilationFailureOutput('err - github/actions/foo.ts:4:7\nFound 1 error')).toBe(true);
            expect(isCompilationFailureOutput('✓ Deployed\nSuccessfully deployed the functions')).toBe(false);
        });
    });

    describe('getDryrunCommandErrorOutput', () => {
        it('detects dryrun failures when the CLI exits successfully but writes an execution error', () => {
            expect(
                getDryrunCommandErrorOutput({
                    stdout: 'Executing -> integration:"github" script:"listRepos"\nDone\n',
                    stderr: 'An error occurred during execution\n{"type":"script_internal_error","payload":{"message":"boom"}}\n'
                })
            ).toBe(
                'Executing -> integration:"github" script:"listRepos"\nDone\nAn error occurred during execution\n{"type":"script_internal_error","payload":{"message":"boom"}}'
            );
        });

        it('does not treat successful dryrun output as an error', () => {
            expect(
                getDryrunCommandErrorOutput({
                    stdout: 'Executing -> integration:"github" script:"listRepos"\nDone\n{"ok":true}\n'
                })
            ).toBeUndefined();
        });
    });

    describe('getDryrunCommandSuccessOutput', () => {
        it('uses stdout only for successful dryrun result parsing', () => {
            const output = getDryrunCommandSuccessOutput({
                stdout: 'Executing -> integration:"github" script:"listRepos"\nDone\n{"ok":true}\n',
                stderr: 'warn: this should not be appended after JSON\n'
            });

            expect(parseDryrunSuccessOutput(output)).toStrictEqual({
                output: 'Executing -> integration:"github" script:"listRepos"\nDone',
                hasResult: true,
                result: { ok: true }
            });
        });
    });

    describe('parseDryrunSuccessOutput', () => {
        it('parses dryrun action results and removes build output from successful responses', () => {
            const output = parseDryrunSuccessOutput(`✓ Typechecking
  Building 1 file(s) - ./github/actions/listRepos.js
✓ Compiled
Note: In Nango Cloud, only logs with level "warn" or "error" will be shown by default.
Executing -> integration:"github" script:"listRepos"
Done
{
  "ok": true,
  "source": "test"
}
`);

            expect(output).toStrictEqual({
                output: 'Executing -> integration:"github" script:"listRepos"\nDone',
                hasResult: true,
                result: { ok: true, source: 'test' }
            });
        });

        it('keeps dryrun execution output when there is no parseable result', () => {
            const output = parseDryrunSuccessOutput(`✓ Typechecking
✓ Compiled
Executing -> integration:"github" script:"listRepos"
Done
not json
`);

            expect(output).toStrictEqual({
                output: 'Executing -> integration:"github" script:"listRepos"\nDone\nnot json',
                hasResult: false
            });
        });
    });

    describe('parseDeploySuccessOutput', () => {
        it('parses deploy success details and removes build output from successful responses', () => {
            const output = parseDeploySuccessOutput(`✓ Typechecking
✓ Compiled
✓ Packaging
✓ Acquiring remote state (https://api-staging.nango.dev)
✓ Deployed
Successfully deployed the functions:
- listRepos@v2.0.0
`);

            expect(output).toStrictEqual({
                output: `✓ Packaging
✓ Acquiring remote state (https://api-staging.nango.dev)
✓ Deployed
Successfully deployed the functions:
- listRepos@v2.0.0`,
                deployed: true,
                deployedFunctions: [{ name: 'listRepos', version: 'v2.0.0' }]
            });
        });
    });
});
