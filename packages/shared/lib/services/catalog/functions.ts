import { getCatalogEntry, TEMPLATES_ZERO_PREFIX } from './actions.js';
import { catalogStore } from './store.js';

import type { FunctionListType, ScriptTypeLiteral } from '@nangohq/types';

export interface CatalogFunction {
    type: FunctionListType;
    name: string;
    /** TypeScript source storage key. */
    sourceLocation: string;
}

const scriptTypeToFolder: Record<ScriptTypeLiteral, 'syncs' | 'actions' | 'on-events'> = {
    sync: 'syncs',
    action: 'actions',
    'on-event': 'on-events'
};

/**
 * Catalog functions of a provider matching a name, one per type.
 * Legacy entries use the canonical provider folder; Functions use their published locations.
 */
export function findCatalogFunctions({ provider, name, type }: { provider: string; name: string; type?: FunctionListType | undefined }): CatalogFunction[] {
    const integration = catalogStore.getEntry(provider);
    if (!integration) {
        return [];
    }

    const folder = integration.symLinkTargetName ?? provider;
    const onEventNames = Object.values(integration.onEventScripts).flat();

    const matches: CatalogFunction[] = [];
    const addMatch = (matchType: ScriptTypeLiteral) => {
        matches.push({ type: matchType, name, sourceLocation: `${TEMPLATES_ZERO_PREFIX}/${folder}/${scriptTypeToFolder[matchType]}/${name}.ts` });
    };

    if (integration.syncs.some((sync) => sync.name === name)) {
        addMatch('sync');
    }
    if (integration.actions.some((action) => action.name === name)) {
        addMatch('action');
    }
    if (onEventNames.includes(name)) {
        addMatch('on-event');
    }

    const entry = getCatalogEntry(provider, name);
    if (entry?.type === 'tool') {
        matches.push({ type: 'tool', name, sourceLocation: entry.location.ts });
    }

    return type ? matches.filter((match) => match.type === type) : matches;
}
