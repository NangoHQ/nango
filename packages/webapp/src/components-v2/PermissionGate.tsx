import { TooltipTrigger } from '@radix-ui/react-tooltip';

import { Tooltip, TooltipContent } from './ui/tooltip';
import { usePermissions } from '@/hooks/usePermissions';

import type { Action, Scope } from '@/hooks/usePermissions';

interface PermissionGateProps {
    bypass?: boolean;
    permission?: { action: Action; scope: Scope; resource: string };
    children: (allowed: boolean) => React.ReactNode;
    tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

export const PermissionGate: React.FC<PermissionGateProps> = ({ permission, children, bypass = false, tooltipSide = 'right' }) => {
    const { can } = usePermissions();
    if (!permission || bypass) {
        return <>{children(true)}</>;
    }

    const { action, scope, resource } = permission;
    const allowed = can(action, scope, resource);

    return (
        <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>{children(allowed)}</TooltipTrigger>
            {!allowed && <TooltipContent side={tooltipSide}>This action is not permitted for your role.</TooltipContent>}
        </Tooltip>
    );
};
