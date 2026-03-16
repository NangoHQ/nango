import { ROLES } from '@nangohq/utils';

import type { Permission } from './types.js';
import type { Role } from '@nangohq/types';

export const ROLE_DENY_MAP: Record<Role, Permission[]> = {
    // ─── Administrator ───────────────────────────────────────
    // No restrictions
    [ROLES.ADMINISTRATOR]: [],

    // ─── Production Support (Support) ────────────────────────
    // Read access + sync commands on production environments.
    // Denied: team/billing management, environment creation, all production write ops
    // (except sync commands), and production secrets/credentials.
    [ROLES.PRODUCTION_SUPPORT]: [
        // admin-only operations (not environment-scoped)
        { action: 'write', resource: 'team', isProduction: null },
        { action: 'delete', resource: 'team_member', isProduction: null },
        { action: 'write', resource: 'invite', isProduction: null },
        { action: 'delete', resource: 'invite', isProduction: null },
        { action: 'write', resource: 'connect_ui_settings', isProduction: null },
        { action: '*', resource: 'billing', isProduction: null },
        { action: 'write', resource: 'plan', isProduction: null },
        { action: 'write', resource: 'environment_production_flag', isProduction: null },
        { action: 'create', resource: 'environment', isProduction: null },
        // production write operations
        { action: 'write', resource: 'integration', isProduction: true },
        { action: 'delete', resource: 'integration', isProduction: true },
        { action: 'write', resource: 'connection', isProduction: true },
        { action: 'delete', resource: 'connection', isProduction: true },
        { action: 'write', resource: 'flow', isProduction: true },
        { action: 'delete', resource: 'environment', isProduction: true },
        { action: 'write', resource: 'environment', isProduction: true },
        { action: 'write', resource: 'environment_key', isProduction: true },
        { action: 'write', resource: 'environment_variable', isProduction: true },
        { action: 'write', resource: 'webhook', isProduction: true },
        // production secrets/credentials (Category 3 — enforced at service layer)
        { action: 'read', resource: 'secret_key', isProduction: true },
        { action: 'read', resource: 'connection_credential', isProduction: true }
    ],

    // ─── Development Full Access (Contributor) ───────────────
    // No access to production environments at all.
    // Denied: everything production_support is denied, plus all production read ops.
    [ROLES.DEVELOPMENT_FULL_ACCESS]: [
        // admin-only operations (not environment-scoped)
        { action: 'write', resource: 'team', isProduction: null },
        { action: 'delete', resource: 'team_member', isProduction: null },
        { action: 'write', resource: 'invite', isProduction: null },
        { action: 'delete', resource: 'invite', isProduction: null },
        { action: 'write', resource: 'connect_ui_settings', isProduction: null },
        { action: '*', resource: 'billing', isProduction: null },
        { action: 'write', resource: 'plan', isProduction: null },
        { action: 'write', resource: 'environment_production_flag', isProduction: null },
        { action: 'create', resource: 'environment', isProduction: null },
        // all production access (read + write)
        { action: '*', resource: '*', isProduction: true }
    ]
};
