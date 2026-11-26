import type { CatalogIndex, CatalogIndexAlias, CatalogIndexProvider, FlowZeroJson } from '@nangohq/types';

function isAlias(summary: CatalogIndexProvider | CatalogIndexAlias): summary is CatalogIndexAlias {
    return 'aliasOf' in summary;
}

/**
 * Every provider's templates from the catalog integration-templates writes into packages/shared, read the way Nango
 * reads it: a provider's `catalog/<provider>.json`, and for an alias its target's file under its own key, with
 * `symLinkTargetName` set. `readFile` gets a path relative to packages/shared. Providers are in catalog.json's order.
 */
export async function readTemplateCatalog(readFile: (path: string) => Promise<string>): Promise<FlowZeroJson[]> {
    const index = JSON.parse(await readFile('catalog.json')) as CatalogIndex;
    const files = new Map<string, FlowZeroJson>();
    const entries: FlowZeroJson[] = [];
    for (const [provider, summary] of Object.entries(index.providers)) {
        const fileSummary = isAlias(summary) ? index.providers[summary.aliasOf] : summary;
        if (!fileSummary || isAlias(fileSummary)) {
            throw new Error(`catalog.json: '${provider}' has no file`);
        }
        let entry = files.get(fileSummary.file);
        if (!entry) {
            entry = JSON.parse(await readFile(fileSummary.file)) as FlowZeroJson;
            files.set(fileSummary.file, entry);
        }
        entries.push(isAlias(summary) ? { ...entry, providerConfigKey: provider, symLinkTargetName: summary.aliasOf } : entry);
    }
    return entries;
}
