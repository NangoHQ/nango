import { CircleHelp } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';

interface InfoTooltipProps {
    children: React.ReactNode;
    side?: 'top' | 'right' | 'bottom' | 'left';
    align?: 'start' | 'center' | 'end';
    icon?: React.ReactNode;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ children, side = 'top', align = 'center', icon = <CircleHelp /> }) => {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    aria-label="More information"
                    className="[&>svg]:size-4 [&>svg]:text-text-muted focus-default inline-flex cursor-help rounded-ds-xs"
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
