import { CatalogReader, TEMPLATES_ZERO_PREFIX } from './reader.js';
import { catalogStore } from './store.js';

import type { CatalogAction, CatalogEntry, CatalogFunctionDefinition } from './reader.js';

export { TEMPLATES_ZERO_PREFIX } from './reader.js';
export type { CatalogEntry, CatalogFunctionDefinition } from './reader.js';
export type CatalogTool = CatalogAction;

const reader = new CatalogReader(catalogStore);

export function listCatalogEntries(provider: string): CatalogEntry[] {
    return reader.listEntries(provider);
}

export function getCatalogEntry(provider: string, name: string): CatalogEntry | undefined {
    return reader.getEntry(provider, name);
}

export function getCatalogFunctionByUuid(uuid: string): CatalogFunctionDefinition | undefined {
    return reader.getFunctionByUuid(uuid);
}

/** Legacy action-only API. Native functions must not enter action execution. */
export function listCatalogTools(provider: string): CatalogTool[] {
    return reader.listActions(provider);
}

/** Legacy action-only API. Native functions must not enter action execution. */
export function getCatalogTool(provider: string, name: string): CatalogTool | undefined {
    return reader.getAction(provider, name);
}

export function isTemplatesZeroPath(fileLocation: string): boolean {
    return fileLocation.startsWith(`${TEMPLATES_ZERO_PREFIX}/`);
}
