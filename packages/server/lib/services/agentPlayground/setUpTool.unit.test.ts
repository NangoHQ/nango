import { describe, expect, it, vi } from 'vitest';

import { resolveApp, SET_UP_INTEGRATIONS_TOOL, setUpIntegrationsTool, stopAfterSetUp } from './setUpTool.js';

import type { AgentPlaygroundIntegrationSetup } from '@nangohq/types';
import type { StepResult, ToolSet } from 'ai';

const options = { toolCallId: 'call-1', messages: [], context: {} };

const catalog = [
    { provider: 'google-mail', name: 'Gmail' },
    { provider: 'google-calendar', name: 'Google Calendar' },
    { provider: 'outlook', name: 'Outlook' },
    { provider: 'microsoft-teams', name: 'Microsoft Teams' }
];

function run(tool: ReturnType<typeof setUpIntegrationsTool>, input: unknown): Promise<unknown> | undefined {
    return tool.execute?.(input, options) as Promise<unknown> | undefined;
}

const created = (provider: string) => Promise.resolve<AgentPlaygroundIntegrationSetup>({ provider, integrationId: `pg-${provider}`, outcome: 'created' });

describe('resolveApp', () => {
    it('matches a provider id or display name, ignoring case and punctuation', () => {
        expect(resolveApp(catalog, 'google-mail')).toEqual({ provider: 'google-mail' });
        expect(resolveApp(catalog, 'gmail')).toEqual({ provider: 'google-mail' });
        expect(resolveApp(catalog, 'Google calendar')).toEqual({ provider: 'google-calendar' });
    });

    it('suggests close matches for an app it cannot place', () => {
        expect(resolveApp(catalog, 'microsoft')).toEqual({ suggestions: ['Microsoft Teams (microsoft-teams)'] });
        expect(resolveApp(catalog, 'asana')).toEqual({ suggestions: [] });
    });
});

describe('setUpIntegrationsTool', () => {
    it('sets up every requested app once', async () => {
        const setUp = vi.fn(created);
        const tool = setUpIntegrationsTool({ catalog, setUp });

        const output = await run(tool, { apps: ['Gmail', 'google-calendar', 'google-mail'] });

        expect(setUp.mock.calls.map(([provider]) => provider)).toEqual(['google-mail', 'google-calendar']);
        expect(output).toEqual({
            setups: [
                { provider: 'google-mail', integrationId: 'pg-google-mail', outcome: 'created' },
                { provider: 'google-calendar', integrationId: 'pg-google-calendar', outcome: 'created' }
            ]
        });
    });

    it('reports apps it cannot place next to the ones it set up', async () => {
        const tool = setUpIntegrationsTool({ catalog, setUp: created });

        const output = await run(tool, { apps: ['Outlook', 'microsoft'] });

        expect(output).toEqual({
            setups: [{ provider: 'outlook', integrationId: 'pg-outlook', outcome: 'created' }],
            unknown: [{ app: 'microsoft', suggestions: ['Microsoft Teams (microsoft-teams)'] }]
        });
    });

    it('sets nothing up when no app is in the catalog', async () => {
        const setUp = vi.fn(created);
        const tool = setUpIntegrationsTool({ catalog, setUp });

        await expect(run(tool, { apps: ['asana'] })).rejects.toThrow("No app matched Nango's catalog. asana: not in the catalog");
        expect(setUp).not.toHaveBeenCalled();
    });
});

describe('stopAfterSetUp', () => {
    const stepWith = (setups: AgentPlaygroundIntegrationSetup[], unknown?: { app: string; suggestions: string[] }[]) =>
        ({ toolResults: [{ toolName: SET_UP_INTEGRATIONS_TOOL, output: { setups, unknown } }] }) as unknown as StepResult<ToolSet>;

    it('stops once an app is set up, so the next request picks up its tools', () => {
        const steps = [stepWith([{ provider: 'google-mail', integrationId: 'pg-google-mail', outcome: 'created' }])];

        expect(stopAfterSetUp({ steps })).toBe(true);
    });

    it('stops when an app could not be added, so the user adds it before the agent goes on', () => {
        const steps = [stepWith([{ provider: 'outlook', outcome: 'needs_developer_app' }])];

        expect(stopAfterSetUp({ steps })).toBe(true);
    });

    it('keeps going when every app was already in the session, so the turn cannot loop on the same call', () => {
        const steps = [stepWith([{ provider: 'google-mail', integrationId: 'pg-google-mail', outcome: 'existing' }])];

        expect(stopAfterSetUp({ steps })).toBe(false);
    });

    it('keeps going when only unknown apps came back, so the agent can ask which one the user meant', () => {
        const steps = [stepWith([], [{ app: 'microsoft', suggestions: ['Microsoft Teams (microsoft-teams)'] }])];

        expect(stopAfterSetUp({ steps })).toBe(false);
    });
});
