import * as React from 'react';

import { cn } from '../../lib/cn';

/**
 * Card — a bordered surface panel with an optional header / content / footer (Figma "Card").
 *
 * Only the `md`, Default look is implemented: Figma also defines `sm`/`xs` sizes and a `Hover`
 * state, but no consumer uses them yet — add them (as a `size`/`state` variant) when one does.
 */
function Card({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="card"
            className={cn('bg-surface-panel text-text-strong flex flex-col overflow-hidden rounded-ds-xs border-ds-1 border-border-default', className)}
            {...props}
        />
    );
}

/** Title + description, with an optional right-aligned action (Figma "Card Header", spacing/4 padding). */
function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="card-header"
            className={cn(
                'grid auto-rows-min grid-rows-[auto_auto] items-start gap-x-2 gap-y-1 p-4 has-data-[slot=card-action]:grid-cols-[1fr_auto]',
                className
            )}
            {...props}
        />
    );
}

/** Figma heading/sm. */
function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="card-title" className={cn('text-text-strong text-ds-lg font-ds-medium leading-ds-snug tracking-ds-tight', className)} {...props} />;
}

/** Figma text/secondary + text/regular/md. */
function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="card-description" className={cn('text-text-secondary text-ds-md font-ds-regular leading-ds-normal', className)} {...props} />;
}

/** Right-aligned header slot (e.g. a button). Grid places it in the second column. */
function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="card-action" className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)} {...props} />;
}

/** Figma "Card Content" — spacing/4 padding, no top (the header provides the top gap). */
function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="card-content" className={cn('px-4 pb-4', className)} {...props} />;
}

/** Figma "Card Footer" — top border + spacing/4 padding. */
function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="card-footer" className={cn('flex items-center border-t-ds-1 border-border-muted p-4', className)} {...props} />;
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
