import { cva } from 'class-variance-authority';
import * as React from 'react';

import { Button } from '@/components-v2/ui/button';
import { Input } from '@/components-v2/ui/input';
import { Textarea } from '@/components-v2/ui/textarea';
import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

function InputGroup({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="input-group"
            role="group"
            className={cn(
                'group/input-group bg-bg-surface border border-border-muted text-text-primary placeholder:text-text-tertiary !text-body-medium-regular relative flex w-full items-center rounded transition-[color,box-shadow] outline-none focus-shadow',
                'h-9 min-w-0 has-[>textarea]:h-auto',

                // Variants based on alignment.
                'has-[>[data-align=inline-start]]:[&>input]:pl-2',
                'has-[>[data-align=inline-end]]:[&>input]:pr-2',
                'has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3',
                'has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3',

                // Focus state.
                'has-[[data-slot=input-group-control]:focus-visible]:shadow-focus has-[[data-slot=input-group-control]:focus-visible]:border-border-default',

                // Error state.
                'has-[[data-slot][aria-invalid=true]]:focus-error has-[[data-slot][aria-invalid=true]]:border-feedback-error-border',

                className
            )}
            {...props}
        />
    );
}

const inputGroupAddonVariants = cva(
    "text-neutral-500 flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium select-none [&>svg:not([class*='size-'])]:size-4 [&>kbd]:rounded-[calc(var(--radius)-5px)] group-data-[disabled=true]/input-group:opacity-50 dark:text-neutral-400",
    {
        variants: {
            align: {
                'inline-start': 'order-first pl-3 has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]',
                'inline-end': 'order-last pr-3 has-[>button]:mr-[-0.45rem] has-[>kbd]:mr-[-0.35rem]',
                'block-start': 'order-first w-full justify-start px-3 pt-3 [.border-b]:pb-3 group-has-[>input]/input-group:pt-2.5',
                'block-end': 'order-last w-full justify-start px-3 pb-3 [.border-t]:pt-3 group-has-[>input]/input-group:pb-2.5'
            }
        },
        defaultVariants: {
            align: 'inline-start'
        }
    }
);

function InputGroupAddon({ className, align = 'inline-start', ...props }: React.ComponentProps<'div'> & VariantProps<typeof inputGroupAddonVariants>) {
    return (
        <div
            role="group"
            data-slot="input-group-addon"
            data-align={align}
            className={cn(inputGroupAddonVariants({ align }), className)}
            onClick={(e) => {
                if ((e.target as HTMLElement).closest('button')) {
                    return;
                }
                e.currentTarget.parentElement?.querySelector('input')?.focus();
            }}
            {...props}
        />
    );
}

const inputGroupButtonVariants = cva('text-sm shadow-none flex gap-2 items-center', {
    variants: {
        size: {
            xs: "h-6 gap-1 px-2 rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-3.5 has-[>svg]:px-2",
            sm: 'h-8 px-2.5 gap-1.5 rounded-md has-[>svg]:px-2.5',
            'icon-xs': 'size-6 rounded-[calc(var(--radius)-5px)] p-0 has-[>svg]:p-0',
            'icon-sm': 'size-8 p-0 has-[>svg]:p-0'
        }
    },
    defaultVariants: {
        size: 'xs'
    }
});

function InputGroupButton({
    className,
    type = 'button',
    variant = 'ghost',
    size = 'xs',
    ...props
}: Omit<React.ComponentProps<typeof Button>, 'size'> & VariantProps<typeof inputGroupButtonVariants>) {
    return <Button type={type} data-size={size} variant={variant} className={cn(inputGroupButtonVariants({ size }), className)} {...props} />;
}

function InputGroupText({ className, ...props }: React.ComponentProps<'span'>) {
    return (
        <span
            className={cn("text-neutral-500 flex items-center gap-2 text-sm [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4", className)}
            {...props}
        />
    );
}

function InputGroupInput({ className, ...props }: React.ComponentProps<'input'>) {
    return (
        <Input
            data-slot="input-group-control"
            className={cn('flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0', className)}
            {...props}
        />
    );
}

function InputGroupTextarea({ className, ...props }: React.ComponentProps<'textarea'>) {
    return (
        <Textarea
            data-slot="input-group-control"
            className={cn('flex-1 resize-none rounded-none border-0 bg-transparent py-3 shadow-none focus-visible:ring-0', className)}
            {...props}
        />
    );
}

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText, InputGroupTextarea };
