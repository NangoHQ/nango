export function withoutDocsTools<T extends { name: string }>(tools: T[]): T[] {
    return tools.filter((tool) => tool.name !== 'docs_search' && tool.name !== 'docs_query_filesystem');
}
