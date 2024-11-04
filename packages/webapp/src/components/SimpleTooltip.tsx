import type React from 'react';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from './ui/Tooltip';

export const SimpleTooltip: React.FC<React.PropsWithChildren<{ tooltipContent: React.ReactNode }>> = ({ tooltipContent, children }) => {
    if (!tooltipContent) {
        return <>{children}</>;
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipContent>{tooltipContent}</TooltipContent>
                <TooltipTrigger>{children}</TooltipTrigger>
            </Tooltip>
        </TooltipProvider>
    );
};
