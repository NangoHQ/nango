import { createContext, useContext } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

import type * as TooltipPrimitive from '@radix-ui/react-tooltip';

const TooltipSuppressedContext = createContext(false);

interface ConditionalTooltipProps {
    condition?: boolean;
    children: React.ReactNode;
    content: React.ReactNode;
    contentClassName?: string;
    asChild?: boolean;
    side?: 'left' | 'right' | 'top' | 'bottom';
}

/**
 * Only renders the tooltip wrapper when the condition is true. Useful for nesting tooltips.
 * When rendered, suppresses any nested ConditionalTooltip so only the outermost active tooltip shows.
 */
export const ConditionalTooltip: React.FC<ConditionalTooltipProps & React.ComponentProps<typeof TooltipPrimitive.Root>> = ({
    condition,
    content,
    contentClassName,
    asChild,
    side = 'bottom',
    children,
    ...props
}) => {
    const suppressed = useContext(TooltipSuppressedContext);

    if (!condition || suppressed) {
        return children;
    }

    return (
        <TooltipSuppressedContext.Provider value={true}>
            <Tooltip {...props}>
                <TooltipTrigger asChild={asChild}>{children}</TooltipTrigger>
                <TooltipContent side={side} className={contentClassName}>
                    {content}
                </TooltipContent>
            </Tooltip>
        </TooltipSuppressedContext.Provider>
    );
};
