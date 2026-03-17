import type { Permission } from './types.js';

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
    canDeleteProdIntegrations: { action: 'delete', resource: 'integration', scope: 'production' },
    canWriteProdConnections: { action: 'write', resource: 'connection', scope: 'production' },
    canDeleteProdConnections: { action: 'delete', resource: 'connection', scope: 'production' },
    canWriteProdFlows: { action: 'write', resource: 'flow', scope: 'production' },
    canWriteProdEnvironment: { action: 'write', resource: 'environment', scope: 'production' },
    canWriteProdEnvironmentKeys: { action: 'write', resource: 'environment_key', scope: 'production' },
    canWriteProdEnvironmentVariables: { action: 'write', resource: 'environment_variable', scope: 'production' },
    canWriteProdWebhooks: { action: 'write', resource: 'webhook', scope: 'production' },
    canDeleteProdEnvironment: { action: 'delete', resource: 'environment', scope: 'production' },

    // production secrets/credentials
    canReadProdSecretKey: { action: 'read', resource: 'secret_key', scope: 'production' },
    canReadProdConnectionCredentials: { action: 'read', resource: 'connection_credential', scope: 'production' }
} as const satisfies Record<string, Permission>;
