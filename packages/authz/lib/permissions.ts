import type { Permission } from '@nangohq/types';

export const permissions = {
    // team management (global scope)
    canManageTeam: { action: 'update', resource: 'team', scope: 'global' },
    canUpdateTeamMember: { action: 'update', resource: 'team_member', scope: 'global' },
    canRemoveTeamMember: { action: 'delete', resource: 'team_member', scope: 'global' },
    canInviteMember: { action: 'create', resource: 'invite', scope: 'global' },
    canCancelInvitation: { action: 'delete', resource: 'invite', scope: 'global' },
    canManageConnectUI: { action: 'update', resource: 'connect_ui_settings', scope: 'global' },
    canManageBilling: { action: '*', resource: 'billing', scope: 'global' },
    canChangePlan: { action: 'update', resource: 'plan', scope: 'global' },
    canToggleIsProduction: { action: 'update', resource: 'environment_production_flag', scope: 'global' },
    canCreateEnvironment: { action: 'create', resource: 'environment', scope: 'global' },

    // production environment access
    canAccessProdEnvironment: { action: 'read', resource: 'environment', scope: 'production' },
    canWriteProdIntegrations: { action: 'update', resource: 'integration', scope: 'production' },
    canDeleteProdIntegrations: { action: 'delete', resource: 'integration', scope: 'production' },
    canWriteProdConnections: { action: 'update', resource: 'connection', scope: 'production' },
    canDeleteProdConnections: { action: 'delete', resource: 'connection', scope: 'production' },
    canWriteProdFlows: { action: 'update', resource: 'flow', scope: 'production' },
    canWriteProdEnvironment: { action: 'update', resource: 'environment', scope: 'production' },
    canWriteProdEnvironmentKeys: { action: 'update', resource: 'environment_key', scope: 'production' },
    canWriteProdEnvironmentVariables: { action: 'update', resource: 'environment_variable', scope: 'production' },
    canWriteProdWebhooks: { action: 'update', resource: 'webhook', scope: 'production' },
    canDeleteProdEnvironment: { action: 'delete', resource: 'environment', scope: 'production' },

    // production secrets/credentials
    canReadProdSecretKey: { action: 'read', resource: 'secret_key', scope: 'production' },
    canReadProdConnectionCredentials: { action: 'read', resource: 'connection_credential', scope: 'production' },

    // playground (reuses sync_command permission — whoever can trigger syncs can use the playground)
    canUseProdPlayground: { action: 'update', resource: 'sync_command', scope: 'production' }
} as const satisfies Record<string, Permission>;
