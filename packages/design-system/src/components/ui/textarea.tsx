import * as React from 'react';

import { cn } from '../../lib/cn';

export type TextareaProps = React.ComponentProps<'textarea'>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
    return (
        <textarea
            ref={ref}
            data-slot="textarea"
            className={cn(
                // Shape + spacing (matches Input)
                'flex w-full min-w-0 rounded-ds-sm border-ds-hairline px-2 py-1.5 outline-none transition-[background-color,border-color,color,box-shadow] duration-100 ease-in-out',
                // Typography (Figma text/regular/md)
                'text-ds-md font-ds-regular leading-ds-normal',
                // Default colors
                'bg-surface-input border-border-interactive text-text-default placeholder:text-text-secondary',
                // Hover border. On focus the 0.5px hairline border adopts the ring color and a 1px inset shadow draws the ring just inside
                // the edge, so the ring covers the border and sits flush inside without expanding the field's footprint.
                'hover:border-border-interactive-hover',
                'focus:border-[var(--focus-ring-default)] focus:shadow-[inset_0_0_0_1px_var(--focus-ring-default)]',
                // Invalid
                'aria-invalid:border-status-danger-border aria-invalid:focus:border-[var(--focus-ring-danger)] aria-invalid:focus:shadow-[inset_0_0_0_1px_var(--focus-ring-danger)]',
                // Disabled — dedicated tokens, no opacity
                'disabled:cursor-not-allowed disabled:border-border-disabled disabled:bg-state-selected-muted disabled:text-text-disabled disabled:placeholder:text-text-disabled',
                className
            )}
            {...props}
        />
    );
});
Textarea.displayName = 'Textarea';

export { Textarea };
