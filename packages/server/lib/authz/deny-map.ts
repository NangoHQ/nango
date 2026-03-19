import { permissions as p } from './permissions.js';

import type { Permission } from './types.js';
import type { Role } from '@nangohq/types';

const ADMIN_ONLY: Permission[] = [
    p.canManageTeam,
    p.canUpdateTeamMember,
    p.canRemoveTeamMember,
    p.canInviteMember,
    p.canCancelInvitation,
    p.canManageConnectUI,
    p.canManageBilling,
    p.canChangePlan,
    p.canToggleIsProduction,
    p.canCreateEnvironment
];

const PROD_WRITES: Permission[] = [
    p.canWriteProdIntegrations,
    p.canDeleteProdIntegrations,
    p.canWriteProdConnections,
    p.canDeleteProdConnections,
    p.canWriteProdFlows,
    p.canDeleteProdEnvironment,
    p.canWriteProdEnvironment,
    p.canWriteProdEnvironmentKeys,
    p.canWriteProdEnvironmentVariables,
    p.canWriteProdWebhooks
];

const PROD_SECRETS: Permission[] = [p.canReadProdSecretKey, p.canReadProdConnectionCredentials];

export const ROLE_DENY_MAP: Record<Role, Permission[]> = {
    administrator: [],
    production_support: [...ADMIN_ONLY, ...PROD_WRITES, ...PROD_SECRETS],
    development_full_access: [...ADMIN_ONLY, { action: '*', resource: '*', scope: 'production' }]
};
