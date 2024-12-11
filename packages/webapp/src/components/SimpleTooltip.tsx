import type React from 'react';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from './ui/Tooltip';
import type { Content } from '@radix-ui/react-tooltip';

export const SimpleTooltip: React.FC<
    React.PropsWithChildren<{ tooltipContent: React.ReactNode; delay?: number } & React.ComponentPropsWithoutRef<typeof Content>>
> = ({ tooltipContent, delay, children, ...rest }) => {
    if (!tooltipContent) {
        return <>{children}</>;
    }

    return (
        <TooltipProvider delayDuration={delay}>
            <Tooltip>
                <TooltipContent {...rest}>{tooltipContent}</TooltipContent>
                <TooltipTrigger>{children}</TooltipTrigger>
            </Tooltip>
        </TooltipProvider>
    );
};
