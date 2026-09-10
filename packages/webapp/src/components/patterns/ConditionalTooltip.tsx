import { createContext, useContext } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@nangohq/design-system';

import type { TooltipProps } from '@nangohq/design-system';

const TooltipSuppressedContext = createContext(false);

interface ConditionalTooltipProps {
    condition?: boolean;
    children: React.ReactNode;
    content: React.ReactNode;
    asChild?: boolean;
    side?: 'left' | 'right' | 'top' | 'bottom';
}

/**
 * Only renders the tooltip wrapper when the condition is true. Useful for nesting tooltips.
 * When rendered, suppresses any nested ConditionalTooltip so only the outermost active tooltip shows.
 */
export const ConditionalTooltip: React.FC<ConditionalTooltipProps & TooltipProps> = ({ condition, content, asChild, side = 'bottom', children, ...props }) => {
    const suppressed = useContext(TooltipSuppressedContext);

    if (!condition || suppressed) {
        return children;
    }

    return (
        <TooltipSuppressedContext.Provider value={true}>
            <Tooltip {...props}>
                <TooltipTrigger asChild={asChild}>{children}</TooltipTrigger>
                <TooltipContent side={side}>{content}</TooltipContent>
            </Tooltip>
        </TooltipSuppressedContext.Provider>
    );
};
