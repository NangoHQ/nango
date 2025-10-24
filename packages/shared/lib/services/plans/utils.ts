import { plansList } from './definitions.js';

import type { PlanDefinition } from '@nangohq/types';

export function getLatestVersionInDefinition(definition: PlanDefinition): number {
    if (Array.isArray(definition.orbVersion)) {
        return Math.max(...definition.orbVersion);
    } else if (typeof definition.orbVersion === 'number') {
        return definition.orbVersion;
    }
    return -1;
}

export function getLatestVersion(name: string): PlanDefinition | undefined {
    const matchingPlans = plansList.filter((p) => p.name === name);
    if (matchingPlans.length === 0) {
        return;
    }

    return matchingPlans.sort((a, b) => getLatestVersionInDefinition(b) - getLatestVersionInDefinition(a))[0];
}

/**
 * Returns plan matching the given name and version, or latest version if no version is provided
 */
export function getMatchingPlanDefinition(name: string, version?: number | null): PlanDefinition | undefined {
    if (!version) {
        return getLatestVersion(name);
    }

    return plansList.find(
        (p) => (p.name === name && p.orbVersion === version) || (p.orbVersion && Array.isArray(p.orbVersion) && p.orbVersion.includes(version))
    );
}
