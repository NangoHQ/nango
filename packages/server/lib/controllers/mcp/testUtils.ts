const unscopedToolNames = new Set(['docs_search', 'docs_query_filesystem', 'providers_get']);

export function withoutUnscopedTools<T extends { name: string }>(tools: T[]): T[] {
    return tools.filter((tool) => !unscopedToolNames.has(tool.name));
}
