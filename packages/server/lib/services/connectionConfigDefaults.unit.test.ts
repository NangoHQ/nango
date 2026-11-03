import { describe, expect, it } from 'vitest';

import { validateCollectAppCredentials, validateConnectionConfigDefaults } from './connectionConfigDefaults.js';

const integrations = [
    { unique_key: 'auth0', provider: 'auth0' },
    { unique_key: 'atlassian', provider: 'atlassian-admin' },
    { unique_key: 'campaign', provider: 'active-campaign' },
    { unique_key: 'onepassword', provider: '1password-events' },
    { unique_key: 'clio', provider: 'clio' }
];

describe('validateConnectionConfigDefaults', () => {
    it('accepts values the provider allows', () => {
        const issues = validateConnectionConfigDefaults(
            {
                auth0: { subdomain: 'acme', oauth_scopes_override: 'read:users', external_id: 42 },
                atlassian: { organizationId: '' },
                campaign: { hostname: 'company.activehosted.com' },
                onepassword: { domain: 'events.1password.eu' },
                clio: { hostname: 'eu.app.clio.com' },
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
        const issues = validateConnectionConfigDefaults(
            { auth0: { subdomain: '' }, campaign: { hostname: '' }, clio: { hostname: '' }, onepassword: { domain: 42 } },
            integrations
        );

        expect(issues.map(({ message }) => message)).toEqual([
            'Auth0 Domain cannot be empty',
            'Hostname must be a valid hostname',
            'Hostname must be one of: app.clio.com, eu.app.clio.com, ca.app.clio.com, au.app.clio.com',
            'Events API Domain must be a string'
        ]);
    });
});

describe('validateCollectAppCredentials', () => {
    const appIntegrations = [
        { unique_key: 'my-github-app', provider: 'github-app' },
        { unique_key: 'my-github', provider: 'github' },
        { unique_key: 'my-github-app-oauth', provider: 'github-app-oauth' }
    ];

    it('accepts the flag on a GitHub App integration, and ignores false or absent flags anywhere', () => {
        const issues = validateCollectAppCredentials(
            {
                'my-github-app': { collect_app_credentials: true },
                'my-github': { collect_app_credentials: false },
                'my-github-app-oauth': {}
            },
            appIntegrations
        );

        expect(issues).toEqual([]);
    });

    it('rejects the flag on integrations that are not GitHub App (auth_mode APP) integrations', () => {
        const issues = validateCollectAppCredentials(
            { 'my-github': { collect_app_credentials: true }, 'my-github-app-oauth': { collect_app_credentials: true } },
            appIntegrations
        );

        expect(issues.map(({ path, message }) => ({ path, message }))).toEqual([
            {
                path: ['integrations_config_defaults', 'my-github', 'collect_app_credentials'],
                message: 'collect_app_credentials is only supported for GitHub App integrations (auth_mode APP)'
            },
            {
                path: ['integrations_config_defaults', 'my-github-app-oauth', 'collect_app_credentials'],
                message: 'collect_app_credentials is only supported for GitHub App integrations (auth_mode APP)'
            }
        ]);
    });
});
