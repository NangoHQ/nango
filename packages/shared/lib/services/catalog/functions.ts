import { getFlowsJson, TEMPLATES_ZERO_PREFIX } from './actions.js';

import type { ScriptTypeLiteral } from '@nangohq/types';

export interface CatalogFunction {
    type: ScriptTypeLiteral;
    name: string;
    /** TypeScript source under `templates-zero/`. */
    sourceLocation: string;
}

const scriptTypeToFolder: Record<ScriptTypeLiteral, 'syncs' | 'actions' | 'on-events'> = {
    sync: 'syncs',
    action: 'actions',
    'on-event': 'on-events'
};

/**
 * Catalog functions of a provider matching a name, one per type.
 * Aliased providers resolve to the folder of the provider they point to.
 */
export function findCatalogFunctions({ provider, name, type }: { provider: string; name: string; type?: ScriptTypeLiteral | undefined }): CatalogFunction[] {
    const integration = getFlowsJson().find((entry) => entry.providerConfigKey === provider);
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

    return type ? matches.filter((match) => match.type === type) : matches;
}
