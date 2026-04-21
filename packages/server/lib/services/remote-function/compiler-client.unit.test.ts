import { describe, expect, it } from 'vitest';

import { buildIndexTs, getFilePaths } from './compiler-client.js';

describe('remote function compiler client helpers', () => {
    it('builds action file paths', () => {
        expect(
            getFilePaths({
                integration_id: 'github',
                function_name: 'smokeTest',
                function_type: 'action'
            })
        ).toStrictEqual({
            tsFilePath: 'github/actions/smokeTest.ts',
            cjsFilePath: 'build/github_actions_smokeTest.cjs'
        });
    });

    it('builds sync file paths', () => {
        expect(
            getFilePaths({
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync'
            })
        ).toStrictEqual({
            tsFilePath: 'github/syncs/syncIssues.ts',
            cjsFilePath: 'build/github_syncs_syncIssues.cjs'
        });
    });

    it('builds the single-entry index file', () => {
        expect(
            buildIndexTs({
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync'
            })
        ).toBe("import './github/syncs/syncIssues.js';\n");
    });
});
