import { ConditionalTooltip } from './ConditionalTooltip';
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
    condition: boolean;
    children: (allowed: boolean) => React.ReactNode;
    asChild?: boolean;
    tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

export const PermissionCondition = ({ condition, children, asChild, tooltipSide = 'bottom' }: PermissionConditionProps) => {
    return (
        <ConditionalTooltip condition={!condition} content="This action is not permitted for your role." asChild={asChild} side={tooltipSide} delayDuration={0}>
            {children(condition)}
        </ConditionalTooltip>
    );
};
