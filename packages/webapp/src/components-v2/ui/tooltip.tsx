import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

function TooltipProvider({ delayDuration = 0, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
    return <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />;
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
    return (
        <TooltipProvider>
            <TooltipPrimitive.Root data-slot="tooltip" {...props} />
        </TooltipProvider>
    );
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
    return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

const tooltipContentVariants = cva(
    'text-text-secondary animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-s leading-4 text-balance',
    {
        variants: {
            variant: {
                primary: 'bg-bg-subtle',
                secondary: 'bg-bg-surface'
            }
        },
        defaultVariants: {
            variant: 'primary'
        }
    }
);

const tooltipPrimitiveVariants = cva('z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]', {
    variants: {
        variant: {
            primary: 'bg-bg-subtle fill-bg-subtle',
            secondary: 'bg-bg-surface fill-bg-surface'
        }
    },
    defaultVariants: {
        variant: 'primary'
    }
});

function TooltipContent({
    className,
    sideOffset = 0,
    children,
    variant,
    ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & VariantProps<typeof tooltipContentVariants>) {
    return (
        <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
                data-slot="tooltip-content"
                sideOffset={sideOffset}
                className={cn(tooltipContentVariants({ variant, className }))}
                {...props}
            >
                {children}
                <TooltipPrimitive.Arrow className={tooltipPrimitiveVariants({ variant })} />
            </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
    );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
