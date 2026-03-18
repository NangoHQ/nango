import { TooltipTrigger } from '@radix-ui/react-tooltip';

import { Tooltip, TooltipContent } from './ui/tooltip';
import { usePermissions } from '@/hooks/usePermissions';

import type { Action, Scope } from '@/hooks/usePermissions';

interface PermissionGateProps {
    permission?: { action: Action; scope: Scope; resource: string };
    children: (allowed: boolean) => React.ReactNode;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({ permission, children }) => {
    const { can } = usePermissions();
    if (!permission) {
        return <>{children(true)}</>;
    }

    const { action, scope, resource } = permission;
    const allowed = can(action, scope, resource);

    return (
        <Tooltip>
            <TooltipTrigger asChild>{children(allowed)}</TooltipTrigger>
            {!allowed && <TooltipContent>This action is not permitted for your role.</TooltipContent>}
        </Tooltip>
    );
};
