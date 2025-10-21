import type { PlanDefinition } from '@nangohq/types';

export interface PlanDefinitionList {
    plan: PlanDefinition;
    active: boolean;
    isFuture?: boolean;
    isDowngrade?: boolean;
    isUpgrade?: boolean;
}
