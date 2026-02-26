import { CircleHelp } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components-v2/ui/tooltip';

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
                <div className="[&>svg]:size-4 [&>svg]:text-text-tertiary">{icon}</div>
            </TooltipTrigger>
            <TooltipContent side={side} align={align}>
                {children}
            </TooltipContent>
        </Tooltip>
    );
};
