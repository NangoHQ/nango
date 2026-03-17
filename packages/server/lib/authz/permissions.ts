import { flags } from '@nangohq/utils';

import { evaluator } from './evaluator.js';

import type { Permission } from './types.js';
import type { Role } from '@nangohq/types';

export const permissions = {
    // team management (global scope)
    canManageTeam: { action: 'write', resource: 'team', scope: 'global' },
    canRemoveTeamMember: { action: 'delete', resource: 'team_member', scope: 'global' },
    canInviteMember: { action: 'write', resource: 'invite', scope: 'global' },
    canCancelInvitation: { action: 'delete', resource: 'invite', scope: 'global' },
    canManageConnectUI: { action: 'write', resource: 'connect_ui_settings', scope: 'global' },
    canManageBilling: { action: '*', resource: 'billing', scope: 'global' },
    canChangePlan: { action: 'write', resource: 'plan', scope: 'global' },
    canToggleIsProduction: { action: 'write', resource: 'environment_production_flag', scope: 'global' },
    canCreateEnvironment: { action: 'create', resource: 'environment', scope: 'global' },

    // production environment access
    canAccessProdEnvironment: { action: 'read', resource: 'environment', scope: 'production' },
    canWriteProdIntegrations: { action: 'write', resource: 'integration', scope: 'production' },
    canWriteProdConnections: { action: 'write', resource: 'connection', scope: 'production' },
    canWriteProdFlows: { action: 'write', resource: 'flow', scope: 'production' },
    canWriteProdEnvironment: { action: 'write', resource: 'environment', scope: 'production' },
    canWriteProdEnvironmentKeys: { action: 'write', resource: 'environment_key', scope: 'production' },
    canDeleteProdEnvironment: { action: 'delete', resource: 'environment', scope: 'production' },

    // production secrets/credentials
    canReadProdSecretKey: { action: 'read', resource: 'secret_key', scope: 'production' },
    canReadProdConnectionCredentials: { action: 'read', resource: 'connection_credential', scope: 'production' }
} as const satisfies Record<string, Permission>;

/**
 * Resolve a permission for the current request.
 * Returns true (allowed) when the feature flag is off or no session user exists (API key auth).
 */
export async function resolve(locals: { user?: { role: Role } }, permission: Permission): Promise<boolean> {
    if (!flags.hasAuthRoles) return true;
    const user = locals.user;
    if (!user) return true;
    return evaluator.evaluate({ role: user.role }, permission);
}

export async function buildPermissions(role: Role): Promise<Record<string, boolean>> {
    if (!flags.hasAuthRoles) {
        return Object.fromEntries(Object.keys(permissions).map((key) => [key, true]));
    }
    const entries = await Promise.all(Object.entries(permissions).map(async ([key, perm]) => [key, await evaluator.evaluate({ role }, perm)]));
    return Object.fromEntries(entries);
}
