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
                'flex w-full min-w-0 rounded border-ds-hairline px-2 py-1.5 outline-none transition-[color,box-shadow]',
                // Typography (Figma text/regular/md)
                'text-ds-md font-ds-regular leading-ds-normal',
                // Default colors
                'bg-surface-input border-border-input text-text-default placeholder:text-text-secondary',
                // Hover / focus border (focus ring removed pending design review)
                'hover:border-border-input-hover focus:border-border-input-hover',
                'data-[filled=true]:not-aria-invalid:border-border-input-hover',
                // Invalid
                'aria-invalid:border-status-danger-border',
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
