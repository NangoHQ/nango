const INTEGRATION_TOOL_SEPARATOR = '__';

export interface ToolDisplay {
    kind: 'search' | 'connect' | 'integration' | 'proxy' | 'other';
    title: string;
    subtitle?: string;
    integrationId?: string;
    method?: string;
    path?: string;
}

const PLAYGROUND_INTEGRATION_PREFIX = 'pg-';

// The server names each playground integration `pg-<provider>`.
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

function integrationTool(qualifiedName: string): { integrationId: string; action: string } | null {
    const index = qualifiedName.indexOf(INTEGRATION_TOOL_SEPARATOR);
    if (index <= 0) {
        return null;
    }
    return { integrationId: qualifiedName.slice(0, index), action: qualifiedName.slice(index + INTEGRATION_TOOL_SEPARATOR.length) };
}

export function describeTool(toolName: string, input: unknown): ToolDisplay {
    const args = (input ?? {}) as Record<string, unknown>;

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
        return { kind: 'connect', title: `Connect ${integrationId ? humanize(integrationId) : 'an app'}`, ...(integrationId ? { integrationId } : {}) };
    }
    if (toolName === 'nango_proxy') {
        const method = typeof args['method'] === 'string' ? args['method'].toUpperCase() : '';
        const path = typeof args['path'] === 'string' ? args['path'] : '';
        const integrationId = typeof args['integration'] === 'string' ? args['integration'] : undefined;
        return {
            kind: 'proxy',
            title: `Calling the ${integrationId ? humanize(integrationId) : ''} API directly`.replace('  ', ' '),
            ...(method ? { method } : {}),
            ...(path ? { path } : {}),
            ...(integrationId ? { integrationId } : {})
        };
    }

    const qualified = toolName === 'nango_execute' && typeof args['tool'] === 'string' ? args['tool'] : toolName;
    const parsed = integrationTool(qualified);
    if (parsed) {
        return { kind: 'integration', title: humanize(parsed.action), integrationId: parsed.integrationId };
    }
    return { kind: 'other', title: humanize(qualified) };
}

export function toolArguments(toolName: string, input: unknown): unknown {
    if (toolName === 'nango_execute' && input && typeof input === 'object') {
        return 'input' in input ? input.input : {};
    }
    return input;
}
