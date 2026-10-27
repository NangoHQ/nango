import { describe, expect, it } from 'vitest';

import { buildPullCommand } from './scripts';

describe('buildPullCommand', () => {
    it('pulls a catalog function by provider', () => {
        expect(buildPullCommand({ integration: 'github', name: 'list-repos', type: 'action', source: { catalog: true, provider: 'github' } })).toBe(
            'nango pull github list-repos --catalog -a'
        );
    });

    it('targets the integration when its name differs from the provider', () => {
        expect(buildPullCommand({ integration: 'my-github', name: 'issues', type: 'sync', source: { catalog: true, provider: 'github' } })).toBe(
            'nango pull github issues --catalog --target my-github -s'
        );
    });

    it('pulls a deployed function by integration', () => {
        expect(buildPullCommand({ integration: 'my-github', name: 'on-create', type: 'on-event', source: { env: 'dev' } })).toBe(
            'nango pull my-github on-create --env dev --on-event'
        );
    });
});
