import { describe, expect, it } from 'vitest';

import { buildDeployArgs, buildDryrunArgs } from './command-builders.js';

describe('remote function command builders', () => {
    it('scopes deploy to the requested integration', () => {
        expect(
            buildDeployArgs({
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: 'export default {}',
                environment_name: 'dev',
                nango_secret_key: 'nango-secret',
                nango_host: 'https://api.example.test'
            })
        ).toStrictEqual(['deploy', 'dev', '--integration', 'github', '--sync', 'syncIssues', '--auto-confirm', '--allow-destructive', '--no-interactive']);
    });

    it('scopes dry-run to the requested integration', () => {
        expect(
            buildDryrunArgs({
                integration_id: 'github',
                function_name: 'createIssue',
                function_type: 'action',
                code: 'export default {}',
                environment_name: 'dev',
                connection_id: 'conn-1',
                nango_secret_key: 'nango-secret',
                nango_host: 'https://api.example.test'
            })
        ).toContain('--integration-id');
    });
});
