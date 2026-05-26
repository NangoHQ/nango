import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { forwardRef } from 'react';

import { cn } from '../../lib/cn';

import type { ReactNode } from 'react';

// Re-export primitives so consumers can compose full tooltips from one import
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = forwardRef<React.ElementRef<typeof TooltipPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>>(
    ({ className, sideOffset = 6, children, ...props }, ref) => (
        <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
                ref={ref}
                sideOffset={sideOffset}
                className={cn(
                    'z-50 max-w-96',
                    'inline-flex items-center gap-[var(--ds-space-2)]',
                    'rounded-[var(--ds-radius-xs)]',
                    'bg-[var(--surface-inverse)]',
                    'px-[var(--ds-space-1-5)] py-[var(--ds-space-1)]',
                    'text-[var(--text-inverse)]',
                    'text-[length:var(--ds-typography-font-size-xs)]',
                    '[font-weight:var(--ds-typography-font-weight-regular)]',
                    'tracking-[var(--ds-typography-letter-spacing-tight)]',
                    'leading-normal',
                    'shadow-[0px_1px_1px_rgba(0,0,0,0.08)]',
                    className
                )}
                {...props}
            >
                {children}
                <TooltipPrimitive.Arrow className="fill-[var(--surface-inverse)]" width={10} height={5} />
            </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
    )
);

TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// Keyboard shortcut badge rendered inside a tooltip
export interface TooltipKbdProps {
    children: ReactNode;
}

function TooltipKbd({ children }: TooltipKbdProps) {
    return (
        <kbd
            className={cn(
                'inline-flex items-center justify-center shrink-0',
                'h-5 min-w-5 px-[var(--ds-space-1)]',
                'rounded-[var(--ds-radius-sm)]',
                'bg-white/20',
                'text-[var(--text-inverse)]',
                'text-[length:var(--ds-typography-font-size-xs)]',
                '[font-weight:var(--ds-typography-font-weight-medium)]',
                'leading-none whitespace-nowrap'
            )}
        >
            {children}
        </kbd>
    );
}

export { Tooltip, TooltipContent, TooltipKbd, TooltipProvider, TooltipTrigger };
