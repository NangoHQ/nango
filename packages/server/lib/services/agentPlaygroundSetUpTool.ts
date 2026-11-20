import { dynamicTool, jsonSchema } from 'ai';

import type { AgentPlaygroundIntegrationSetup, AgentPlaygroundSetUpToolName, AgentPlaygroundSetUpToolOutput } from '@nangohq/types';
import type { StopCondition, ToolSet } from 'ai';

export const SET_UP_INTEGRATIONS_TOOL: AgentPlaygroundSetUpToolName = 'set_up_integrations';

const MAX_APPS = 5;
const MAX_SUGGESTIONS = 5;

export interface CatalogEntry {
    provider: string;
    name: string;
}

function normalize(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function resolveApp(catalog: CatalogEntry[], app: string): { provider: string } | { suggestions: string[] } {
    const wanted = normalize(app);
    const exact =
        catalog.find((entry) => entry.provider === app) ?? catalog.find((entry) => normalize(entry.name) === wanted || normalize(entry.provider) === wanted);
    if (exact) {
        return { provider: exact.provider };
    }
    const suggestions = wanted
        ? catalog.filter((entry) => normalize(entry.name).includes(wanted) || normalize(entry.provider).includes(wanted)).slice(0, MAX_SUGGESTIONS)
        : [];
    return { suggestions: suggestions.map((entry) => `${entry.name} (${entry.provider})`) };
}

export function setUpIntegrationsTool({
    catalog,
    setUp
}: {
    catalog: CatalogEntry[];
    setUp: (provider: string) => Promise<AgentPlaygroundIntegrationSetup>;
}): ToolSet[string] {
    return dynamicTool({
        description: `Adds integrations to this environment for apps from Nango's catalog that have no integration yet, so their tools become available. Pass every app the request needs in one call, at most ${MAX_APPS}, each exactly as the user wrote it, keeping qualifiers such as "(TBA)", or by provider id. Only pass apps the user named or confirmed; when they did not name one, ask them first.`,
        inputSchema: jsonSchema<{ apps: string[] }>({
            type: 'object',
            properties: { apps: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: MAX_APPS } },
            required: ['apps'],
            additionalProperties: false
        }),
        execute: async (input): Promise<AgentPlaygroundSetUpToolOutput> => {
            const requested = Array.isArray((input as { apps?: unknown }).apps) ? (input as { apps: unknown[] }).apps : [];
            const apps = [...new Set(requested.filter((app): app is string => typeof app === 'string'))].slice(0, MAX_APPS);
            const providers = new Set<string>();
            const unknown: NonNullable<AgentPlaygroundSetUpToolOutput['unknown']> = [];
            for (const app of apps) {
                const resolved = resolveApp(catalog, app);
                if ('provider' in resolved) {
                    providers.add(resolved.provider);
                } else {
                    unknown.push({ app, suggestions: resolved.suggestions });
                }
            }
            if (providers.size === 0) {
                const hints = unknown.map(
                    ({ app, suggestions }) => `${app}: ${suggestions.length > 0 ? `did you mean ${suggestions.join(', ')}?` : 'not in the catalog'}`
                );
                throw new Error(`No app matched Nango's catalog. ${hints.join(' ')}`);
            }
            const setups = await Promise.all([...providers].map(setUp));
            return unknown.length > 0 ? { setups, unknown } : { setups };
        }
    });
}

// Stop only when a setup changes what the next session holds. Stopping on an existing integration repeats the same call.
export const stopAfterSetUp: StopCondition<ToolSet> = ({ steps }) =>
    Boolean(
        steps
            .at(-1)
            ?.toolResults.some(
                (result) =>
                    result.toolName === SET_UP_INTEGRATIONS_TOOL &&
                    (result.output as AgentPlaygroundSetUpToolOutput).setups.some((setup) => setup.outcome !== 'existing')
            )
    );
