import { ROLES } from '@nangohq/utils';

import type { Permission } from './types.js';
import type { Role } from '@nangohq/types';

const ADMIN_ONLY: Permission[] = [
    { action: 'write', resource: 'team', scope: 'global' },
    { action: 'delete', resource: 'team_member', scope: 'global' },
    { action: 'write', resource: 'invite', scope: 'global' },
    { action: 'delete', resource: 'invite', scope: 'global' },
    { action: 'write', resource: 'connect_ui_settings', scope: 'global' },
    { action: '*', resource: 'billing', scope: 'global' },
    { action: 'write', resource: 'plan', scope: 'global' },
    { action: 'write', resource: 'environment_production_flag', scope: 'global' },
    { action: 'create', resource: 'environment', scope: 'global' }
];

const PROD_WRITES: Permission[] = [
    { action: 'write', resource: 'integration', scope: 'production' },
    { action: 'delete', resource: 'integration', scope: 'production' },
    { action: 'write', resource: 'connection', scope: 'production' },
    { action: 'delete', resource: 'connection', scope: 'production' },
    { action: 'write', resource: 'flow', scope: 'production' },
    { action: 'delete', resource: 'environment', scope: 'production' },
    { action: 'write', resource: 'environment', scope: 'production' },
    { action: 'write', resource: 'environment_key', scope: 'production' },
    { action: 'write', resource: 'environment_variable', scope: 'production' },
    { action: 'write', resource: 'webhook', scope: 'production' }
];

const PROD_SECRETS: Permission[] = [
    { action: 'read', resource: 'secret_key', scope: 'production' },
    { action: 'read', resource: 'connection_credential', scope: 'production' }
];

export const ROLE_DENY_MAP: Record<Role, Permission[]> = {
    [ROLES.ADMINISTRATOR]: [],
    [ROLES.PRODUCTION_SUPPORT]: [...ADMIN_ONLY, ...PROD_WRITES, ...PROD_SECRETS],
    [ROLES.DEVELOPMENT_FULL_ACCESS]: [...ADMIN_ONLY, { action: '*', resource: '*', scope: 'production' }]
};
