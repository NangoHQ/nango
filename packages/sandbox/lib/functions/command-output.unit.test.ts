import { describe, expect, it } from 'vitest';

import { combineCommandOutput, getCommandOutput, getDryrunCommandSuccessOutput, parseDeploySuccessOutput, parseDryrunSuccessOutput } from './command-output.js';

describe('sandboxed function command output helpers', () => {
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
            const deployment = [
                '✓ Packaging',
                '✓ Acquiring remote state (https://api-staging.nango.dev)',
                '✓ Deployed',
                'Successfully deployed: ',
                '- github → listRepos@v2.0.0'
            ];
            const output = parseDeploySuccessOutput(['✓ Typechecking', '✓ Compiled', ...deployment, ''].join('\r\n'));

            expect(output).toStrictEqual({
                output: deployment.join('\n'),
                deployed: true,
                deployedFunctions: [{ name: 'listRepos', version: '2.0.0' }]
            });
        });

        it('parses native functions without a version and ignores removed functions', () => {
            const output = parseDeploySuccessOutput(
                ['✓ Packaging', '✓ Deployed', 'Successfully deployed: ', '- github → fetchIssues', 'Successfully removed: ', '- github → oldFunction'].join(
                    '\r\n'
                )
            );

            expect(output.deployed).toBe(true);
            expect(output.deployedFunctions).toStrictEqual([{ name: 'fetchIssues' }]);
        });

        it('returns no functions when nothing was deployed', () => {
            expect(parseDeploySuccessOutput('✓ Packaging\n✓ Acquiring remote state (https://api.nango.dev)\n\n  No changes').deployedFunctions).toStrictEqual(
                []
            );
        });
    });
});
