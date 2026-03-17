import { useUser } from './useUser';

import type { AllowedPermissions } from '@nangohq/types';

type Action = 'create' | 'read' | 'update' | 'delete' | '*';
type Scope = 'production' | 'non-production' | 'global';

export function usePermissions(): { can: (action: Action, scope: Scope, resource: string) => boolean; permissions: AllowedPermissions } {
    const { user } = useUser();
    const permissions = user?.permissions ?? {};
    return {
        permissions,
        can: (action: Action, scope: Scope, resource: string) => permissions[resource]?.[scope]?.includes(action) ?? false
    };
}
