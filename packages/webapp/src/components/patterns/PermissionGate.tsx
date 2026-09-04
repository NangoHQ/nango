import { ConditionalTooltip } from './ConditionalTooltip';

interface PermissionGateProps {
    condition: boolean;
    message?: string;
    children: (allowed: boolean) => React.ReactNode;
    asChild?: boolean;
    tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

export const PERMISSION_DENIED_REASON = 'This action is not permitted for your role.';

export const PermissionGate = ({ condition, message = PERMISSION_DENIED_REASON, children, asChild, tooltipSide = 'bottom' }: PermissionGateProps) => {
    return (
        <ConditionalTooltip condition={!condition} content={message} asChild={asChild} side={tooltipSide} delayDuration={0}>
            {children(condition)}
        </ConditionalTooltip>
    );
};
