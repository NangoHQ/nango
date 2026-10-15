const INTEGRATION_TOOL_SEPARATOR = '__';

export interface IntegrationLabel {
    provider: string;
    name: string;
    integrationName: string;
}

export type IntegrationLabels = ReadonlyMap<string, IntegrationLabel>;

export interface ToolDisplay {
    kind: 'search' | 'connect' | 'integration' | 'proxy' | 'other';
    title: string;
    subtitle?: string;
    integrationId?: string;
    integration?: IntegrationLabel;
    method?: string;
    path?: string;
}

const PLAYGROUND_INTEGRATION_PREFIX = 'pg-';

// The server keys the integrations it creates `pg-<provider>`.
export function providerFor(integrationId: string): string {
    return integrationId.startsWith(PLAYGROUND_INTEGRATION_PREFIX) ? integrationId.slice(PLAYGROUND_INTEGRATION_PREFIX.length) : integrationId;
}

export function humanize(name: string): string {
    return providerFor(name)
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export function integrationLabels(
    integrations: readonly { unique_key: string; provider: string; display_name: string | null; meta: { displayName: string } }[]
): IntegrationLabels {
    return new Map(
        integrations.map((integration) => {
            const name = integration.meta.displayName.replace(/\s*\([^)]*\)$/, '');
            const catalogueName = integration.unique_key.startsWith(PLAYGROUND_INTEGRATION_PREFIX) ? name : integration.meta.displayName;
            return [integration.unique_key, { provider: integration.provider, name, integrationName: integration.display_name || catalogueName }];
        })
    );
}

export function labelFor(integrationId: string, labels: IntegrationLabels | undefined): IntegrationLabel {
    const name = humanize(integrationId);
    return labels?.get(integrationId) ?? { provider: providerFor(integrationId), name, integrationName: name };
}

function integrationTool(qualifiedName: string): { integrationId: string; action: string } | null {
    const index = qualifiedName.indexOf(INTEGRATION_TOOL_SEPARATOR);
    if (index <= 0) {
        return null;
    }
    return { integrationId: qualifiedName.slice(0, index), action: qualifiedName.slice(index + INTEGRATION_TOOL_SEPARATOR.length) };
}

export function qualifiedToolName(toolName: string, input: unknown): string {
    const tool = (input as { tool?: unknown } | null | undefined)?.tool;
    return toolName === 'nango_execute' && typeof tool === 'string' ? tool : toolName;
}

export function describeTool(toolName: string, input: unknown, labels?: IntegrationLabels): ToolDisplay {
    const args = (input ?? {}) as Record<string, unknown>;
    const withIntegration = (integrationId: string | undefined): Pick<ToolDisplay, 'integrationId' | 'integration'> =>
        integrationId ? { integrationId, integration: labelFor(integrationId, labels) } : {};

    if (toolName === 'nango_tool_search') {
        const query = typeof args['query'] === 'string' ? args['query'] : undefined;
        const named = query && !/\s/.test(query) ? integrationTool(query) : null;
        if (named) {
            return { kind: 'search', title: `Checking how to use ${humanize(named.action)}` };
        }
        return { kind: 'search', title: 'Searching for the right tool', ...(query ? { subtitle: `“${query}”` } : {}) };
    }
    if (toolName === 'nango_create_connection') {
        const integrationId = typeof args['integration'] === 'string' ? args['integration'] : undefined;
        const integration = withIntegration(integrationId);
        return { kind: 'connect', title: `Connect ${integration.integration?.name ?? 'an app'}`, ...integration };
    }
    if (toolName === 'nango_proxy') {
        const method = typeof args['method'] === 'string' ? args['method'].toUpperCase() : '';
        const path = typeof args['path'] === 'string' ? args['path'] : '';
        const integrationId = typeof args['integration'] === 'string' ? args['integration'] : undefined;
        const integration = withIntegration(integrationId);
        return {
            kind: 'proxy',
            title: `Calling the ${integration.integration?.name ?? ''} API directly`.replace('  ', ' '),
            ...(method ? { method } : {}),
            ...(path ? { path } : {}),
            ...integration
        };
    }

    const qualified = qualifiedToolName(toolName, input);
    const parsed = integrationTool(qualified);
    if (parsed) {
        return { kind: 'integration', title: humanize(parsed.action), ...withIntegration(parsed.integrationId) };
    }
    return { kind: 'other', title: humanize(qualified) };
}

export function toolArguments(toolName: string, input: unknown): unknown {
    if (toolName === 'nango_execute' && input && typeof input === 'object') {
        return 'input' in input ? input.input : {};
    }
    return input;
}
