import type { Role } from '@nangohq/types';

export type Action = 'create' | 'read' | 'update' | 'delete' | '*';
export type Resource =
    | 'team'
    | 'team_member'
    | 'invite'
    | 'connect_ui_settings'
    | 'billing'
    | 'plan'
    | 'environment'
    | 'environment_production_flag'
    | 'environment_key'
    | 'environment_variable'
    | 'webhook'
    | 'integration'
    | 'connection'
    | 'flow'
    | 'sync_command'
    | 'secret_key'
    | 'connection_credential'
    | 'log'
    | '*';
export type Scope = 'production' | 'non-production' | 'global';

export interface Permission {
    action: Action;
    resource: Resource;
    scope: Scope;
}

export interface PermissionEvaluator {
    evaluate(role: Role, permission: Permission): Promise<boolean>;
}
