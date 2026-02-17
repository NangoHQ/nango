import { CircleHelp } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components-v2/ui/tooltip';

interface InfoTooltipProps {
    children: React.ReactNode;
    side?: 'top' | 'right' | 'bottom' | 'left';
    align?: 'start' | 'center' | 'end';
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ children, side = 'top', align = 'center' }) => {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <CircleHelp className="size-4 text-text-tertiary" />
            </TooltipTrigger>
            <TooltipContent side={side} align={align}>
                {children}
            </TooltipContent>
        </Tooltip>
    );
};
