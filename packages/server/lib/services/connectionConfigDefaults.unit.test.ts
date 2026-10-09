import { describe, expect, it } from 'vitest';

import { validateConnectionConfigDefaults } from './connectionConfigDefaults.js';

const integrations = [
    { unique_key: 'auth0', provider: 'auth0' },
    { unique_key: 'atlassian', provider: 'atlassian-admin' },
    { unique_key: 'campaign', provider: 'active-campaign' },
    { unique_key: 'onepassword', provider: '1password-events' }
];

describe('validateConnectionConfigDefaults', () => {
    it('accepts values the provider allows', () => {
        const issues = validateConnectionConfigDefaults(
            {
                auth0: { subdomain: 'acme', oauth_scopes_override: 'read:users', external_id: 42 },
                atlassian: { organizationId: '' },
                campaign: { hostname: 'company.activehosted.com' },
                onepassword: { domain: 'events.1password.eu' },
                'not-an-integration': { subdomain: 'Not Valid!' }
            },
            integrations
        );

        expect(issues).toEqual([]);
    });

    it('reports every value the provider rejects', () => {
        const issues = validateConnectionConfigDefaults(
            {
                auth0: { subdomain: 'Not Valid!' },
                atlassian: { organizationId: 'Not Valid!' },
                campaign: { hostname: 'https://company.activehosted.com' },
                onepassword: { domain: 'events.1password.jp' }
            },
            integrations
        );

        expect(issues.map(({ path, message }) => ({ path, message }))).toEqual([
            { path: ['integrations_config_defaults', 'auth0', 'connection_config', 'subdomain'], message: 'Auth0 Domain has an invalid format' },
            {
                path: ['integrations_config_defaults', 'atlassian', 'connection_config', 'organizationId'],
                message: 'Atlassian Organization Id has an invalid format'
            },
            { path: ['integrations_config_defaults', 'campaign', 'connection_config', 'hostname'], message: 'Hostname must be a valid hostname' },
            {
                path: ['integrations_config_defaults', 'onepassword', 'connection_config', 'domain'],
                message: 'Events API Domain must be one of: events.1password.com, events.1password.ca, events.1password.eu'
            }
        ]);
    });

    it('reports values that are empty or not a string', () => {
        const issues = validateConnectionConfigDefaults({ auth0: { subdomain: '' }, campaign: { hostname: 42 } }, integrations);

        expect(issues.map(({ message }) => message)).toEqual(['Auth0 Domain cannot be empty', 'Hostname must be a string']);
    });
});
