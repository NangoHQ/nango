import { describe, expect, it } from 'vitest';

import { describeTool, integrationLabels, labelFor } from './toolDisplay.js';

const labels = integrationLabels([
    { unique_key: 'github-getting-started', provider: 'github', meta: { displayName: 'GitHub (User OAuth)' } },
    { unique_key: 'pg-google-calendar', provider: 'google-calendar', meta: { displayName: 'Google Calendar' } }
]);

describe('labelFor', () => {
    it('uses the provider and its display name for an integration in the list', () => {
        expect(labelFor('github-getting-started', labels)).toEqual({ provider: 'github', name: 'GitHub' });
    });

    it('guesses from the id while the list is loading', () => {
        expect(labelFor('pg-google-calendar', undefined)).toEqual({ provider: 'google-calendar', name: 'Google Calendar' });
    });

    it('guesses from the id when the integration is not in the list', () => {
        expect(labelFor('my-hubspot', labels)).toEqual({ provider: 'my-hubspot', name: 'My Hubspot' });
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
            integration: { provider: 'github', name: 'GitHub' }
        });
    });

    it('labels an integration tool with its provider', () => {
        const display = describeTool('nango_execute', { tool: 'github-getting-started__list-repos', input: {} }, labels);

        expect(display).toEqual({
            kind: 'integration',
            title: 'List Repos',
            integrationId: 'github-getting-started',
            integration: { provider: 'github', name: 'GitHub' }
        });
    });

    it('names the app to connect', () => {
        expect(describeTool('nango_create_connection', { integration: 'github-getting-started' }, labels).title).toBe('Connect GitHub');
    });
});
