import type { PlanDefinition } from '@nangohq/types';

export interface PlanDefinitionList {
    plan: PlanDefinition;
    active: boolean;
    isDowngrade?: boolean;
    isUpgrade?: boolean;
}
