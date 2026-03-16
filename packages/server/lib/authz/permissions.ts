import { flags } from '@nangohq/utils';

import { evaluator } from './evaluator.js';

import type { Permission } from './types.js';
import type { Role } from '@nangohq/types';

export const CAPABILITIES: Record<string, Permission> = {
    // team management (not environment-scoped)
    canManageTeam: { action: 'write', resource: 'team', isProduction: null },
    canRemoveTeamMember: { action: 'delete', resource: 'team_member', isProduction: null },
    canInviteMember: { action: 'write', resource: 'invite', isProduction: null },
    canCancelInvitation: { action: 'delete', resource: 'invite', isProduction: null },
    canManageConnectUI: { action: 'write', resource: 'connect_ui_settings', isProduction: null },
    canManageBilling: { action: '*', resource: 'billing', isProduction: null },
    canChangePlan: { action: 'write', resource: 'plan', isProduction: null },
    canToggleIsProduction: { action: 'write', resource: 'environment_production_flag', isProduction: null },
    canCreateEnvironment: { action: 'create', resource: 'environment', isProduction: null },

    // production environment access
    canAccessProdEnvironment: { action: 'read', resource: 'environment', isProduction: true },
    canWriteProdIntegrations: { action: 'write', resource: 'integration', isProduction: true },
    canWriteProdConnections: { action: 'write', resource: 'connection', isProduction: true },
    canWriteProdFlows: { action: 'write', resource: 'flow', isProduction: true },
    canWriteProdEnvironment: { action: 'write', resource: 'environment', isProduction: true },
    canWriteProdEnvironmentKeys: { action: 'write', resource: 'environment_key', isProduction: true },
    canDeleteProdEnvironment: { action: 'delete', resource: 'environment', isProduction: true },

    // production secrets/credentials
    canReadProdSecretKey: { action: 'read', resource: 'secret_key', isProduction: true },
    canReadProdConnectionCredentials: { action: 'read', resource: 'connection_credential', isProduction: true }
};

export async function buildPermissions(role: Role): Promise<Record<string, boolean>> {
    if (!flags.hasAuthRoles) {
        return Object.fromEntries(Object.keys(CAPABILITIES).map((key) => [key, true]));
    }
    const entries = await Promise.all(Object.entries(CAPABILITIES).map(async ([key, permission]) => [key, await evaluator.evaluate({ role }, permission)]));
    return Object.fromEntries(entries);
}
