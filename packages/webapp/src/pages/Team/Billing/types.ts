import type { PlanDefinition } from '@nangohq/types';

export interface PlanDefinitionList {
    plan: PlanDefinition;
    active: boolean;
    isFuture?: boolean;
    isDowngrade?: boolean;
    isUpgrade?: boolean;
}

export function getLatestVersionInDefinition(definition: PlanDefinition): number {
    if (Array.isArray(definition.orbVersion)) {
        return Math.max(...definition.orbVersion);
    } else if (typeof definition.orbVersion === 'number') {
        return definition.orbVersion;
    }
    return -1;
}
