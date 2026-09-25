import { CircleHelp } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@nangohq/design-system';

import { cn } from '@/utils/utils';

interface InfoTooltipProps {
    children: React.ReactNode;
    side?: 'top' | 'right' | 'bottom' | 'left';
    align?: 'start' | 'center' | 'end';
    icon?: React.ReactNode;
    /** `md` is 16px. `sm` is 12px, for sitting next to 12px labels. */
    size?: 'sm' | 'md';
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ children, side = 'top', align = 'center', icon = <CircleHelp />, size = 'md' }) => {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    aria-label="More information"
                    className={cn(
                        '[&>svg]:text-text-muted focus-default inline-flex items-center p-0 cursor-help rounded-ds-xs',
                        size === 'sm' ? '[&>svg]:size-3' : '[&>svg]:size-4'
                    )}
                >
                    {icon}
                </button>
            </TooltipTrigger>
            <TooltipContent side={side} align={align}>
                {children}
            </TooltipContent>
        </Tooltip>
    );
};
