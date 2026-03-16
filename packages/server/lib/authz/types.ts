import type { Role } from '@nangohq/types';

export interface Permission {
    action: string; // 'create' | 'delete' | 'write' | 'read' | '*'
    resource: string; // 'environment' | 'integration' | 'team' | '*'
    isProduction: boolean | null; // true = production env, false = non-production, null = not environment-scoped
}

export interface PermissionEvaluator {
    evaluate(subject: { role: Role }, permission: Permission): boolean;
}
