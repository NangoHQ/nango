import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/Tooltip';

import type { Content } from '@radix-ui/react-tooltip';
import type React from 'react';

export const SimpleTooltip: React.FC<
    React.PropsWithChildren<{ tooltipContent: React.ReactNode; delay?: number } & React.ComponentPropsWithoutRef<typeof Content>>
> = ({ tooltipContent, delay, children, ...rest }) => {
    if (!tooltipContent) {
        return <>{children}</>;
    }

    return (
        <TooltipProvider delayDuration={delay ?? 0}>
            <Tooltip>
                <TooltipContent {...rest}>{tooltipContent}</TooltipContent>
                <TooltipTrigger>{children}</TooltipTrigger>
            </Tooltip>
        </TooltipProvider>
    );
};
