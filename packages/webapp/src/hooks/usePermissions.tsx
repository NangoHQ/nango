import { useUser } from './useUser';

import type { AllowedPermissions, Permission } from '@nangohq/types';

export function usePermissions(): { can: (permission: Permission) => boolean; permissions: AllowedPermissions } {
    const { user } = useUser();
    const permissions = user?.permissions ?? {};
    return {
        permissions,
        can: (permission: Permission) => permissions[permission.resource]?.[permission.scope]?.includes(permission.action) ?? false
    };
}
