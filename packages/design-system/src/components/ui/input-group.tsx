import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/cn';
import { IconButton } from './button';
import { Input } from './input';
import { Textarea } from './textarea';

import type { InputProps } from './input';
import type { VariantProps } from 'class-variance-authority';

const inputGroupVariants = cva(
    [
        'group/input-group bg-surface-input border-ds-hairline border-border-interactive text-text-default placeholder:text-text-secondary text-ds-md font-ds-regular leading-ds-normal relative flex w-full items-center rounded-ds-sm transition-[background-color,border-color,color,box-shadow] duration-100 ease-in-out outline-none hover:border-border-interactive-hover',
        'min-w-0 has-[>textarea]:h-auto',

        // Variants based on alignment.
        'has-[>[data-align=inline-start]]:[&>input]:pl-2',
        'has-[>[data-align=inline-end]]:[&>input]:pr-2',
        'has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3',
        'has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3',

        // Focus state — border darkens when the control is focused (focus ring removed pending design review).
        'has-[[data-slot=input-group-control]:focus-visible]:outline-none has-[[data-slot=input-group-control]:focus-visible]:border-border-interactive-hover',
        // Filled state - different border when input has text (works for both controlled and uncontrolled inputs)
        'has-[[data-slot=input-group-control][data-filled=true]:not(:disabled)]:border-border-interactive-hover',

        // Disabled — dedicated tokens (matches Input), no opacity.
        'has-[[data-slot=input-group-control]:disabled]:border-border-disabled has-[[data-slot=input-group-control]:disabled]:bg-state-selected-muted',

        // Error state.
        'has-[[data-slot][aria-invalid=true]]:!border-status-danger-border'
    ],
    {
        variants: {
            size: {
                // Default control height (matches Input).
                default: 'h-9',
                // Hug-content — for in-popover search fields. Pair with `size="auto"` on the inner InputGroupInput.
                auto: 'h-auto'
            }
        },
        defaultVariants: {
            size: 'default'
        }
    }
);

function InputGroup({ className, size, ...props }: Omit<React.ComponentProps<'div'>, 'size'> & VariantProps<typeof inputGroupVariants>) {
    return <div data-slot="input-group" role="group" className={cn(inputGroupVariants({ size }), className)} {...props} />;
}

export const inputGroupAddonVariants = cva(
    "text-text-muted flex h-auto cursor-text items-center justify-center gap-1 py-1.5 text-ds-md font-ds-medium select-none [&>svg:not([class*='size-'])]:size-4 [&>kbd]:rounded-ds-xs group-data-[disabled=true]/input-group:opacity-50",
    {
        variants: {
            align: {
                'inline-start': 'order-first pl-2 has-[>kbd]:ml-[-0.35rem]',
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

// Icon-only affordance for input groups (edit, clear, …). Renders the design-system IconButton;
// the input-group icon sizes map to IconButton sizes: icon-sm → xs (24px), icon-xs → 2xs (20px).
function InputGroupButton({
    type = 'button',
    variant = 'ghost',
    size = 'icon-xs',
    ...props
}: Omit<React.ComponentProps<typeof IconButton>, 'size' | 'className'> & { size?: 'icon-xs' | 'icon-sm' }) {
    return <IconButton type={type} variant={variant} size={size === 'icon-sm' ? 'xs' : '2xs'} {...props} />;
}

function InputGroupText({ className, ...props }: React.ComponentProps<'span'>) {
    return (
        <span
            className={cn("text-text-muted flex items-center gap-2 text-ds-md [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4", className)}
            {...props}
        />
    );
}

const InputGroupInput = React.forwardRef<HTMLInputElement, InputProps>(({ className, size, value, defaultValue, onChange, ...props }, ref) => {
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
            size={size}
            data-slot="input-group-control"
            data-filled={isFilled}
            className={cn('flex-1 rounded-none border-0 bg-transparent shadow-none disabled:bg-transparent focus-visible:ring-0', className)}
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
                className={cn(
                    'flex-1 resize-none rounded-none border-0 bg-transparent py-3 shadow-none disabled:bg-transparent focus-visible:ring-0',
                    className
                )}
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
