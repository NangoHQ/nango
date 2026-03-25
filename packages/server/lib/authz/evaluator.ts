import { ROLE_DENY_MAP } from './deny-map.js';

import type { Action, Permission, PermissionEvaluator, Resource, Role, Scope } from '@nangohq/types';

function matchesAction(rule: Action, actual: Action): boolean {
    return rule === '*' || rule === actual;
}

function matchesResource(rule: Resource, actual: Resource): boolean {
    return rule === '*' || rule === actual;
}

function matchesScope(rule: Scope, actual: Scope): boolean {
    return rule === actual;
}

export class StaticEvaluator implements PermissionEvaluator {
    // eslint-disable-next-line @typescript-eslint/require-await -- async for interface contract, static impl is sync
    async evaluate(role: Role, permission: Permission): Promise<boolean> {
        const denyList = ROLE_DENY_MAP[role];
        if (!denyList) return false; // unknown role → deny
        if (denyList.length === 0) return true; // no restrictions (e.g. administrator)

        return !denyList.some(
            (rule) =>
                matchesAction(rule.action, permission.action) &&
                matchesResource(rule.resource, permission.resource) &&
                matchesScope(rule.scope, permission.scope)
        );
    }
}

export const evaluator: PermissionEvaluator = new StaticEvaluator();
