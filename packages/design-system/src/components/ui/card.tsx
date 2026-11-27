import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/cn';

import type { VariantProps } from 'class-variance-authority';

/**
 * Card — a bordered surface panel with an optional header / content / footer (Figma "Card").
 *
 * Only the `md` size is implemented, in `default` and `danger` variants: Figma also defines `sm`/`xs` sizes and a `Hover`
 * state, but no consumer uses them yet — add them (as a `size`/`state` variant) when one does.
 */
const cardVariants = cva('bg-surface-panel text-text-strong flex flex-col overflow-hidden rounded-ds-md border-ds-1 shadow-container-panel', {
    variants: {
        variant: {
            default: 'border-border-default',
            danger: 'border-border-danger-subtle'
        },
        selected: {
            true: 'border-border-selected',
            false: ''
        }
    },
    defaultVariants: { variant: 'default', selected: false }
});

type CardProps = React.ComponentProps<'div'> & VariantProps<typeof cardVariants>;

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, variant, selected, ...props }, ref) => (
    <div ref={ref} data-slot="card" className={cn(cardVariants({ variant, selected }), className)} {...props} />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        data-slot="card-header"
        className={cn(
            'grid auto-rows-min grid-rows-[auto_auto] items-start gap-x-2 gap-y-1 px-5 py-4 has-data-[slot=card-action]:grid-cols-[1fr_auto]',
            className
        )}
        {...props}
    />
));
CardHeader.displayName = 'CardHeader';

/** Figma heading/sm. */
const CardTitle = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        data-slot="card-title"
        className={cn('text-text-strong text-ds-lg font-ds-medium leading-ds-snug tracking-ds-tight', className)}
        {...props}
    />
));
CardTitle.displayName = 'CardTitle';

/** Figma text/secondary + text/regular/md. */
const CardDescription = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-description" className={cn('text-text-secondary text-ds-md font-ds-regular leading-ds-normal', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

/** Right-aligned header slot (e.g. a button). The header grid places it in the second column. */
const CardAction = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-action" className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)} {...props} />
));
CardAction.displayName = 'CardAction';

/** No top padding: the header provides the top gap. */
const CardContent = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-content" className={cn('px-5 pb-5', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        data-slot="card-footer"
        className={cn('flex items-center bg-surface-panel-muted border-t border-border-muted py-3 pr-3 pl-5', className)}
        {...props}
    />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, cardVariants, type CardProps };
