import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

import { cn } from '../../lib/cn';

export type TooltipProps = React.ComponentProps<typeof TooltipPrimitive.Root>;
export type TooltipProviderProps = React.ComponentProps<typeof TooltipPrimitive.Provider>;
export type TooltipContentProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>;

function TooltipProvider({ delayDuration = 0, ...props }: TooltipProviderProps) {
    return <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />;
}

function Tooltip({ ...props }: TooltipProps) {
    return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

const TooltipTrigger = React.forwardRef<React.ElementRef<typeof TooltipPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>>(
    (props, ref) => <TooltipPrimitive.Trigger ref={ref} data-slot="tooltip-trigger" {...props} />
);
TooltipTrigger.displayName = 'TooltipTrigger';

const TooltipContent = React.forwardRef<React.ElementRef<typeof TooltipPrimitive.Content>, TooltipContentProps>(
    ({ className, sideOffset = 0, children, ...props }, ref) => (
        <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
                ref={ref}
                data-slot="tooltip-content"
                sideOffset={sideOffset}
                className={cn(
                    'bg-surface-inverse text-text-inverse type-label-sm shadow-container-panel rounded-ds-xs px-1.5 py-1',
                    'origin-(--radix-tooltip-content-transform-origin) z-80 w-fit max-w-96 text-balance',
                    'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
                    'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
                    className
                )}
                {...props}
            >
                {children}
                <TooltipPrimitive.Arrow className="bg-surface-inverse fill-surface-inverse rounded-ds-xs z-80 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45" />
            </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
    )
);
TooltipContent.displayName = 'TooltipContent';

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
