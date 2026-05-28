import { ConditionalTooltip } from './ConditionalTooltip';

interface PermissionGateProps {
    condition: boolean;
    message?: string;
    children: (allowed: boolean) => React.ReactNode;
    asChild?: boolean;
    tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

export const PermissionGate = ({
    condition,
    message = 'This action is not permitted for your role.',
    children,
    asChild,
    tooltipSide = 'bottom'
}: PermissionGateProps) => {
    return (
        <ConditionalTooltip condition={!condition} content={message} asChild={asChild} side={tooltipSide} delayDuration={0}>
            {children(condition)}
        </ConditionalTooltip>
    );
};
