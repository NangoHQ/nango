import { describe, expect, it } from 'vitest';

import { describeTool, integrationLabels, labelFor } from './toolDisplay.js';

const labels = integrationLabels([
    { unique_key: 'github-getting-started', provider: 'github', display_name: 'Github (Getting Started)', meta: { displayName: 'GitHub (User OAuth)' } },
    { unique_key: 'github-app', provider: 'github-app', display_name: null, meta: { displayName: 'GitHub (App)' } },
    { unique_key: 'pg-google-calendar', provider: 'google-calendar', display_name: null, meta: { displayName: 'Google Calendar' } },
    { unique_key: 'pg-github', provider: 'github', display_name: null, meta: { displayName: 'GitHub (User OAuth)' } },
    { unique_key: 'pg-github-team', provider: 'github', display_name: null, meta: { displayName: 'GitHub (User OAuth)' } }
]);

const gettingStarted = { provider: 'github', name: 'GitHub', integrationName: 'Github (Getting Started)' };

describe('labelFor', () => {
    it('uses the provider, its display name and the integration name for an integration in the list', () => {
        expect(labelFor('github-getting-started', labels)).toEqual(gettingStarted);
    });

    it('falls back to the provider display name when the integration has no name of its own', () => {
        expect(labelFor('github-app', labels)).toEqual({ provider: 'github-app', name: 'GitHub', integrationName: 'GitHub (App)' });
    });

    it('drops the auth variant from an integration the playground created', () => {
        expect(labelFor('pg-github', labels)).toEqual({ provider: 'github', name: 'GitHub', integrationName: 'GitHub' });
    });

    it('keeps the auth variant for a user-created integration that only starts with pg-', () => {
        expect(labelFor('pg-github-team', labels).integrationName).toBe('GitHub (User OAuth)');
    });

    it('guesses from the id while the list is loading', () => {
        expect(labelFor('pg-google-calendar', undefined)).toEqual({
            provider: 'google-calendar',
            name: 'Google Calendar',
            integrationName: 'Google Calendar'
        });
    });

    it('guesses from the id when the integration is not in the list', () => {
        expect(labelFor('my-hubspot', labels)).toEqual({ provider: 'my-hubspot', name: 'My Hubspot', integrationName: 'My Hubspot' });
    });
});

describe('describeTool', () => {
    it('names a proxy call after the provider, not the integration id', () => {
        const display = describeTool('nango_proxy', { integration: 'github-getting-started', method: 'get', path: '/user' }, labels);

        expect(display).toEqual({
            kind: 'proxy',
            title: 'Calling the GitHub API directly',
            method: 'GET',
            path: '/user',
            integrationId: 'github-getting-started',
            integration: gettingStarted
        });
    });

    it('labels an integration tool with its provider', () => {
        const display = describeTool('nango_execute', { tool: 'github-getting-started__list-repos', input: {} }, labels);

        expect(display).toEqual({
            kind: 'integration',
            title: 'List Repos',
            integrationId: 'github-getting-started',
            integration: gettingStarted
        });
    });

    it('names the app to connect', () => {
        expect(describeTool('nango_create_connection', { integration: 'github-getting-started' }, labels).title).toBe('Connect GitHub');
    });
});
