import { useUser } from './useUser';

import type { AllowedPermissions } from '@nangohq/types';

export function usePermissions(): { can: (resource: string, action: string, scope: string) => boolean; permissions: AllowedPermissions } {
    const { user } = useUser();
    const permissions = user?.permissions ?? {};
    return {
        permissions,
        can: (resource: string, action: string, scope: string) => permissions[resource]?.[scope]?.includes(action) ?? false
    };
}
