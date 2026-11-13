import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/cn';
import { IconButton } from './button';
import { useFieldControl } from './field-context';
import { passwordManagerProps } from './input';

import type { InputProps } from './input';
import type { VariantProps } from 'class-variance-authority';

// State selectors target the inner control ([data-slot=input-group-control]). They're spelled out in full because
// Tailwind only generates classes it can read literally. :read-only also matches disabled inputs, so read-only excludes them.

const inputGroupVariants = cva(
    [
        'group/input-group relative flex w-full min-w-0 items-center',
        // Shape (Figma radius/sm, borderWidth/1) and group padding-x 4px (space/1)
        'rounded-ds-sm border-ds-1 px-1 outline-none transition-[background-color,border-color,color,box-shadow] duration-100 ease-in-out',
        // Default
        'bg-surface-input border-border-input text-text-default',
        // Hover — not on read-only, which keeps its muted border
        'not-has-[[data-slot=input-group-control]:read-only]:hover:border-border-input-hover',
        // Read-only: muted fill + default border, still focusable / selectable / copyable
        'has-[[data-slot=input-group-control]:read-only:not(:disabled)]:bg-surface-input-muted has-[[data-slot=input-group-control]:read-only:not(:disabled)]:border-border-default',
        // Focus (:focus-within on the control) — 1px border + 0.5px inset = 1.5px, no layout shift
        'has-[[data-slot=input-group-control]:focus]:border-focus-ring-default! has-[[data-slot=input-group-control]:focus]:shadow-[inset_0_0_0_0.5px_var(--focus-ring-default)]',
        // Error — aria-invalid on the control (set for you inside <Field data-invalid>). The focus rule carries one more
        // pseudo-class than the plain error rule, so specificity (not CSS order) makes it win.
        'has-[[data-slot=input-group-control][aria-invalid=true]:not(:disabled)]:border-border-input-danger!',
        'hover:has-[[data-slot=input-group-control][aria-invalid=true]:not(:disabled):not(:focus)]:border-border-input-danger-hover!',
        'has-[[data-slot=input-group-control][aria-invalid=true]:focus:not(:disabled)]:border-focus-ring-danger! has-[[data-slot=input-group-control][aria-invalid=true]:focus:not(:disabled)]:shadow-[inset_0_0_0_0.5px_var(--focus-ring-danger)]',
        // Disabled
        'has-[[data-slot=input-group-control]:disabled]:bg-state-disabled! has-[[data-slot=input-group-control]:disabled]:border-border-disabled! has-[[data-slot=input-group-control]:disabled]:cursor-not-allowed',

        // Textarea + block addons hug their content
        'has-[>textarea]:h-auto',
        'has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col',
        'has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col'
    ],
    {
        variants: {
            size: {
                // 32px (Figma size md)
                md: 'h-8',
                // 28px (Figma size sm)
                sm: 'h-7',
                /** @deprecated Use `md`. Kept so existing call sites keep compiling. */
                default: 'h-8',
                // Hug-content — for in-popover search fields. Pair with `size="auto"` on the inner InputGroupInput.
                auto: 'h-auto',
                // Agent Playground composer — keeps its own look (hairline border, panel fill, darker border on focus).
                composer: [
                    'h-auto items-end rounded-ds-xs border-ds-hairline px-0 border-border-default bg-surface-panel hover:border-border-strong',
                    '[&>textarea]:max-h-48 [&>textarea]:min-h-26 [&>textarea]:px-4 [&>textarea]:pt-3.5 [&>textarea]:[field-sizing:content] [&>[data-align=inline-end]]:pr-3 [&>[data-align=inline-end]]:pb-3',
                    'shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]',
                    // The composer keeps focus for the whole conversation, so a darker border marks focus instead of the ring.
                    // `textarea` in the selector out-ranks the base focus rule.
                    'has-[textarea[data-slot=input-group-control]:focus]:border-border-stronger! has-[textarea[data-slot=input-group-control]:focus]:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]'
                ]
            }
        },
        defaultVariants: {
            size: 'md'
        }
    }
);

export type InputGroupProps = Omit<React.ComponentProps<'div'>, 'size'> & VariantProps<typeof inputGroupVariants>;

/**
 * Frame for an input plus addons (Figma Dharma "Input Group", 2586:573). The group draws the border and states;
 * InputGroupInput is borderless inside it. Pass `mono` to InputGroupInput for IDs, keys, URLs and env var names.
 */
function InputGroup({ className, size, ...props }: InputGroupProps) {
    return <div data-slot="input-group" data-size={size ?? 'md'} role="group" className={cn(inputGroupVariants({ size }), className)} {...props} />;
}

export const inputGroupAddonVariants = cva(
    [
        'flex h-auto shrink-0 cursor-text items-center justify-center gap-1 select-none',
        'font-sans text-ds-sm font-ds-regular leading-ds-normal text-text-secondary',
        // Icon addons: 14px, icon/secondary (Figma Input Group Addon 2585:310)
        "[&>svg]:text-icon-secondary [&>svg:not([class*='size-'])]:size-3.5 [&>svg]:shrink-0",
        // Icon / text / kbd / swatch addons get 6px side padding; button addons sit 4px from the edge (the group's own padding)
        'px-1.5 has-[>button]:px-0',
        'group-has-[[data-slot=input-group-control]:disabled]/input-group:text-text-disabled group-has-[[data-slot=input-group-control]:disabled]/input-group:[&>svg]:text-icon-disabled'
    ],
    {
        variants: {
            align: {
                'inline-start': 'order-first',
                'inline-end': 'order-last',
                'block-start': 'order-first w-full justify-start px-1.5 pt-2',
                'block-end': 'order-last w-full justify-start px-1.5 pb-2'
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
                e.currentTarget.parentElement?.querySelector<HTMLElement>('input, textarea')?.focus();
            }}
            {...props}
        />
    );
}

// Icon-only affordance for input groups (reveal, copy, clear, …): a 24px ghost IconButton with a 14px icon.
// `icon-xs` (default) is the Figma spec; `icon-sm` is a deprecated alias kept for existing call sites — both render 24px.
const InputGroupButton = React.forwardRef<
    HTMLButtonElement,
    Omit<React.ComponentProps<typeof IconButton>, 'size' | 'className'> & {
        /** @deprecated-value `icon-sm` — use `icon-xs`. */
        size?: 'icon-xs' | 'icon-sm';
    }
>(({ type = 'button', variant = 'ghost', size: _size, ...props }, ref) => (
    <IconButton ref={ref} type={type} variant={variant} size="xs" className="[&_svg:not([class*='size-'])]:size-3.5" {...props} />
));
InputGroupButton.displayName = 'InputGroupButton';

function InputGroupText({ className, ...props }: React.ComponentProps<'span'>) {
    return (
        <span
            data-slot="input-group-text"
            className={cn(
                "font-sans text-ds-sm font-ds-regular leading-ds-normal text-text-secondary flex items-center gap-1.5 [&_svg]:pointer-events-none [&_svg]:text-icon-secondary [&_svg:not([class*='size-'])]:size-3.5",
                className
            )}
            {...props}
        />
    );
}

/** Keyboard hint, e.g. the "/" shortcut in SearchInput. */
function InputGroupKbd({ className, ...props }: React.ComponentProps<'kbd'>) {
    return (
        <kbd
            data-slot="input-group-kbd"
            className={cn(
                'font-mono text-ds-2xs font-ds-regular leading-ds-normal text-text-secondary border-border-default inline-flex h-4 min-w-4 items-center justify-center rounded-ds-xs border-ds-1 px-1',
                className
            )}
            {...props}
        />
    );
}

/** Colour chip for a colour-value addon. `color` is the user's value (e.g. a brand hex), not a design token. */
function InputGroupSwatch({ color, className, style, ...props }: React.ComponentProps<'span'> & { color: string }) {
    return (
        <span
            data-slot="input-group-swatch"
            aria-hidden
            className={cn('border-border-default size-3.5 shrink-0 rounded-ds-xs border-ds-1', className)}
            style={{ ...style, backgroundColor: color }}
            {...props}
        />
    );
}

function useFilled<T extends HTMLInputElement | HTMLTextAreaElement>(
    value: React.ComponentProps<'input'>['value'],
    defaultValue: React.ComponentProps<'input'>['defaultValue'],
    onChange: ((e: React.ChangeEvent<T>) => void) | undefined
) {
    const [uncontrolledFilled, setUncontrolledFilled] = React.useState(() => defaultValue !== undefined && String(defaultValue).length > 0);
    const isFilled = value !== undefined ? String(value).length > 0 : uncontrolledFilled;
    const handleChange = (e: React.ChangeEvent<T>) => {
        if (value === undefined) {
            setUncontrolledFilled(e.target.value.length > 0);
        }
        onChange?.(e);
    };
    return { isFilled, handleChange };
}

const controlBase = [
    'flex-1 min-w-0 bg-transparent outline-none border-0 text-text-default placeholder:text-text-placeholder',
    'disabled:cursor-not-allowed disabled:text-text-disabled disabled:placeholder:text-text-disabled'
];

export interface InputGroupInputProps extends InputProps {}

const InputGroupInput = React.forwardRef<HTMLInputElement, InputGroupInputProps>(
    ({ className, size, mono, value, defaultValue, onChange, autoComplete, ...props }, ref) => {
        const { isFilled, handleChange } = useFilled<HTMLInputElement>(value, defaultValue, onChange);
        const fieldProps = useFieldControl(props);
        return (
            <input
                ref={ref}
                data-slot="input-group-control"
                data-filled={isFilled}
                className={cn(
                    controlBase,
                    // Input padding-x 6px, so text sits 10px from the edge with no addon (4px group + 6px)
                    size === 'auto' ? 'h-auto p-0' : 'h-full px-1.5',
                    mono ? 'font-mono text-ds-xs font-ds-regular leading-ds-normal' : 'font-sans text-ds-sm font-ds-regular leading-ds-normal',
                    className
                )}
                value={value}
                defaultValue={defaultValue}
                onChange={handleChange}
                autoComplete={autoComplete ?? 'off'}
                {...passwordManagerProps(autoComplete)}
                {...props}
                {...fieldProps}
            />
        );
    }
);
InputGroupInput.displayName = 'InputGroupInput';

const InputGroupTextarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
    ({ className, value, defaultValue, onChange, ...props }, ref) => {
        const { isFilled, handleChange } = useFilled<HTMLTextAreaElement>(value, defaultValue, onChange);
        const fieldProps = useFieldControl(props);
        return (
            <textarea
                ref={ref}
                data-slot="input-group-control"
                data-filled={isFilled}
                className={cn(controlBase, 'font-sans text-ds-sm font-ds-regular leading-ds-normal resize-none self-stretch px-1.5 py-1.5', className)}
                value={value}
                defaultValue={defaultValue}
                onChange={handleChange}
                {...props}
                {...fieldProps}
            />
        );
    }
);
InputGroupTextarea.displayName = 'InputGroupTextarea';

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupKbd, InputGroupSwatch, InputGroupText, InputGroupTextarea };
