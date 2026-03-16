import { ROLE_DENY_MAP } from './deny-map.js';

import type { Permission, PermissionEvaluator } from './types.js';
import type { Role } from '@nangohq/types';

function matchesAction(rule: string, actual: string): boolean {
    return rule === '*' || rule === actual;
}

function matchesResource(rule: string, actual: string): boolean {
    return rule === '*' || rule === actual;
}

function matchesProduction(rule: boolean | null, actual: boolean | null): boolean {
    if (rule === null && actual === null) return true; // both non-environment-scoped
    if (rule === null || actual === null) return false; // one scoped, one not
    return rule === actual;
}

export class StaticEvaluator implements PermissionEvaluator {
    // eslint-disable-next-line @typescript-eslint/require-await -- async for interface contract, static impl is sync
    async evaluate(subject: { role: Role }, permission: Permission): Promise<boolean> {
        const denyList = ROLE_DENY_MAP[subject.role];
        if (!denyList) return false; // unknown role → deny
        if (denyList.length === 0) return true; // no restrictions (e.g. administrator)

        return !denyList.some(
            (rule) =>
                matchesAction(rule.action, permission.action) &&
                matchesResource(rule.resource, permission.resource) &&
                matchesProduction(rule.isProduction, permission.isProduction)
        );
    }
}

export const evaluator: PermissionEvaluator = new StaticEvaluator();
