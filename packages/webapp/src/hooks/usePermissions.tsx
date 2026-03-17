import { useUser } from './useUser';

import type { AllowedPermissions } from '@nangohq/types';

type Action = 'create' | 'read' | 'update' | 'delete' | '*';
type Scope = 'production' | 'non-production' | 'global';

export function usePermissions(): { can: (resource: string, action: Action, scope: Scope) => boolean; permissions: AllowedPermissions } {
    const { user } = useUser();
    const permissions = user?.permissions ?? {};
    return {
        permissions,
        can: (resource: string, action: Action, scope: Scope) => permissions[resource]?.[scope]?.includes(action) ?? false
    };
}
