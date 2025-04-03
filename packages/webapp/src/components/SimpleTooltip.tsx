import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/Tooltip';

import type { Content } from '@radix-ui/react-tooltip';
import type React from 'react';

export const SimpleTooltip: React.FC<
    React.PropsWithChildren<{ tooltipContent: React.ReactNode; delay?: number; triggerClassName?: string } & React.ComponentPropsWithoutRef<typeof Content>>
> = ({ tooltipContent, delay, children, triggerClassName, ...rest }) => {
    if (!tooltipContent) {
        return <>{children}</>;
    }

    return (
        <TooltipProvider delayDuration={delay}>
            <Tooltip>
                <TooltipContent {...rest}>{tooltipContent}</TooltipContent>
                <TooltipTrigger className={triggerClassName}>{children}</TooltipTrigger>
            </Tooltip>
        </TooltipProvider>
    );
};
