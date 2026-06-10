import { cva } from 'class-variance-authority';
import * as React from 'react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

function InputGroup({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="input-group"
            role="group"
            className={cn(
                'group/input-group bg-surface-canvas border border-border-input text-text-strong placeholder:text-text-muted !text-body-medium-regular relative flex w-full items-center rounded transition-[color,box-shadow] outline-none hover:border-border-input-hover has-[[data-slot=input-group-control]:disabled]:hover:border-border-input',
                'h-9 min-w-0 has-[>textarea]:h-auto',

                // Variants based on alignment.
                'has-[>[data-align=inline-start]]:[&>input]:pl-2',
                'has-[>[data-align=inline-end]]:[&>input]:pr-2',
                'has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3',
                'has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3',

                // Focus state
                'has-[[data-slot=input-group-control]:focus-visible]:outline-none has-[[data-slot=input-group-control]:focus-visible]:border-border-input-hover',
                // Filled state - different border when input has text (works for both controlled and uncontrolled inputs)
                'has-[[data-slot=input-group-control][data-filled=true]:not(:disabled)]:border-border-input-hover',

                // Error state.
                'has-[[data-slot][aria-invalid=true]]:!border-text-danger',

                className
            )}
            {...props}
        />
    );
}

const inputGroupAddonVariants = cva(
    "text-neutral-500 flex h-auto cursor-text items-center justify-center gap-1 py-1.5 text-sm font-medium select-none [&>svg:not([class*='size-'])]:size-4 [&>kbd]:rounded-[calc(var(--radius)-5px)] group-data-[disabled=true]/input-group:opacity-50 dark:text-neutral-400",
    {
        variants: {
            align: {
                'inline-start': 'order-first pl-2 has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]',
                'inline-end': 'order-last pr-2 has-[>kbd]:mr-[-0.35rem]',
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
            'icon-xs': 'size-4 rounded-[calc(var(--radius)-5px)] p-0 has-[>svg]:p-0',
            'icon-sm': 'size-6 p-0 has-[>svg]:p-0'
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

const InputGroupInput = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, value, defaultValue, onChange, ...props }, ref) => {
    const [isFilled, setIsFilled] = React.useState(() => {
        // Check initial state for both controlled and uncontrolled inputs
        if (value !== undefined) {
            return String(value).length > 0;
        }
        if (defaultValue !== undefined) {
            return String(defaultValue).length > 0;
        }
        return false;
    });

    React.useEffect(() => {
        // Update filled state when value prop changes (controlled input)
        if (value !== undefined) {
            setIsFilled(String(value).length > 0);
        }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Update filled state for uncontrolled inputs
        if (value === undefined) {
            setIsFilled(e.target.value.length > 0);
        }
        onChange?.(e);
    };

    return (
        <Input
            ref={ref}
            data-slot="input-group-control"
            data-filled={isFilled}
            className={cn('flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0', className)}
            value={value}
            defaultValue={defaultValue}
            onChange={handleChange}
            {...props}
        />
    );
});
InputGroupInput.displayName = 'InputGroupInput';

const InputGroupTextarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
    ({ className, value, defaultValue, onChange, ...props }, ref) => {
        const [isFilled, setIsFilled] = React.useState(() => {
            // Check initial state for both controlled and uncontrolled inputs
            if (value !== undefined) {
                return String(value).length > 0;
            }
            if (defaultValue !== undefined) {
                return String(defaultValue).length > 0;
            }
            return false;
        });

        React.useEffect(() => {
            // Update filled state when value prop changes (controlled input)
            if (value !== undefined) {
                setIsFilled(String(value).length > 0);
            }
        }, [value]);

        const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            // Update filled state for uncontrolled inputs
            if (value === undefined) {
                setIsFilled(e.target.value.length > 0);
            }
            onChange?.(e);
        };

        return (
            <Textarea
                ref={ref}
                data-slot="input-group-control"
                data-filled={isFilled}
                className={cn('flex-1 resize-none rounded-none border-0 bg-transparent py-3 shadow-none focus-visible:ring-0', className)}
                value={value}
                defaultValue={defaultValue}
                onChange={handleChange}
                {...props}
            />
        );
    }
);
InputGroupTextarea.displayName = 'InputGroupTextarea';

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText, InputGroupTextarea };
