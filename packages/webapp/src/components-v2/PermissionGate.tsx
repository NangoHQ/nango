import { TooltipTrigger } from '@radix-ui/react-tooltip';

import { Tooltip, TooltipContent } from './ui/tooltip';
import { usePermissions } from '@/hooks/usePermissions';

import type { Action, Scope } from '@/hooks/usePermissions';

interface PermissionGateProps {
    bypass?: boolean;
    permission?: { action: Action; scope: Scope; resource: string };
    children: (allowed: boolean) => React.ReactNode;
    asChild?: boolean;
    tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

export const PermissionGate: React.FC<PermissionGateProps> = ({ permission, children, bypass = false, tooltipSide = 'right', asChild = false }) => {
    const { can } = usePermissions();

    return (
        <PermissionCondition asChild={asChild} condition={bypass || (permission ? can(permission) : true)} tooltipSide={tooltipSide}>
            {children}
        </PermissionCondition>
    );
};

interface PermissionConditionProps {
    condition?: boolean;
    children: (allowed: boolean) => React.ReactNode;
    asChild?: boolean;
    tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

export const PermissionCondition = ({ condition, children, asChild, tooltipSide = 'right' }: PermissionConditionProps) => {
    if (condition) {
        return <>{children(true)}</>;
    }

    return (
        <Tooltip delayDuration={0}>
            <TooltipTrigger asChild={asChild}>{children(false)}</TooltipTrigger>
            {!condition && <TooltipContent side={tooltipSide}>This action is not permitted for your role.</TooltipContent>}
        </Tooltip>
    );
};
