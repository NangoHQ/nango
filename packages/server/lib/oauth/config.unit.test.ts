import { describe, expect, it } from 'vitest';

import { assertOAuthServerUsesDashboardApiOrigin } from './config.js';

describe('OAuth server origin configuration', () => {
    it('accepts the dashboard API origin', () => {
        expect(() => assertOAuthServerUsesDashboardApiOrigin('https://api.nango.dev', 'https://api.nango.dev')).not.toThrow();
        expect(() => assertOAuthServerUsesDashboardApiOrigin('https://api.nango.dev/', 'https://api.nango.dev')).not.toThrow();
    });

    it('allows the OAuth server to remain disabled', () => {
        expect(() => assertOAuthServerUsesDashboardApiOrigin(undefined, 'https://api.nango.dev')).not.toThrow();
    });

    it('rejects a different OAuth origin', () => {
        expect(() => assertOAuthServerUsesDashboardApiOrigin('https://id.nango.dev', 'https://api.nango.dev')).toThrow(
            'NANGO_OAUTH_SERVER_BASE_URL must use the same origin as the dashboard API'
        );
    });
});
