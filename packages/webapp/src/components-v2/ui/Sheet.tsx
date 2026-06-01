'use client';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/utils/utils';

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
    return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
    return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
    return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
    return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
    return (
        <SheetPrimitive.Overlay
            data-slot="sheet-overlay"
            className={cn(
                'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-300 data-[state=open]:duration-500 ease-in-out fixed inset-0 z-70 bg-black/30',
                className
            )}
            {...props}
        />
    );
}

function SheetContent({
    className,
    children,
    side = 'right',
    overlayClassName,
    insetTop,
    insetBottom,
    insetLeft,
    insetRight,
    scrollable = true,
    ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
    side?: 'top' | 'right' | 'bottom' | 'left';
    overlayClassName?: string;
    /** Inset from viewport edges (px). When set for right/left sheets, height becomes calc(100vh - top - bottom). */
    insetTop?: number;
    insetBottom?: number;
    insetLeft?: number;
    insetRight?: number;
    /** When true (default when insets are used), wrap content in a scrollable area so the whole sheet scrolls. */
    scrollable?: boolean;
}) {
    const hasInset = side === 'right' || side === 'left' ? insetTop != null || insetBottom != null : insetLeft != null || insetRight != null;
    const useScrollable = hasInset ? scrollable : false;

    const insetStyle =
        side === 'right' && (insetTop != null || insetBottom != null)
            ? {
                  top: insetTop ?? 0,
                  bottom: insetBottom ?? 0,
                  right: insetRight ?? 24,
                  height: `calc(100vh - ${insetTop ?? 0}px - ${insetBottom ?? 0}px)`
              }
            : side === 'left' && (insetTop != null || insetBottom != null)
              ? {
                    top: insetTop ?? 0,
                    bottom: insetBottom ?? 0,
                    left: insetLeft ?? 24,
                    height: `calc(100vh - ${insetTop ?? 0}px - ${insetBottom ?? 0}px)`
                }
              : undefined;

    return (
        <SheetPortal>
            <SheetOverlay className={overlayClassName} />
            <SheetPrimitive.Content
                data-slot="sheet-content"
                style={insetStyle}
                className={cn(
                    'bg-bg-elevated data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-70 flex flex-col gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
                    side === 'right' &&
                        (insetStyle
                            ? 'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right min-h-0 w-3/4 border-l sm:max-w-sm'
                            : 'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm'),
                    side === 'left' &&
                        (insetStyle
                            ? 'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left min-h-0 w-3/4 border-r sm:max-w-sm'
                            : 'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm'),
                    side === 'top' && 'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b',
                    side === 'bottom' && 'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t',
                    className,
                    useScrollable && 'pr-[18px]'
                )}
                {...props}
            >
                {useScrollable ? <div className="scrollbar-app flex min-h-0 w-full flex-1 flex-col overflow-auto pr-1">{children}</div> : children}
                <SheetPrimitive.Close className="ring-offset-white focus:ring-neutral-950 data-[state=open]:bg-neutral-100 absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none dark:ring-offset-neutral-950 dark:focus:ring-neutral-300 dark:data-[state=open]:bg-neutral-800">
                    <XIcon />
                    <span className="sr-only">Close</span>
                </SheetPrimitive.Close>
            </SheetPrimitive.Content>
        </SheetPortal>
    );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="sheet-header" className={cn('flex flex-col gap-1.5 p-4', className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="sheet-footer" className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
    return <SheetPrimitive.Title data-slot="sheet-title" className={cn('text-neutral-950 font-semibold dark:text-neutral-50', className)} {...props} />;
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
    return <SheetPrimitive.Description data-slot="sheet-description" className={cn('text-neutral-500 text-sm dark:text-neutral-400', className)} {...props} />;
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger };
