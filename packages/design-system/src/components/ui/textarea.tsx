import * as React from 'react';

import { cn } from '../../lib/cn';
import { useFieldControl } from './field-context';

export type TextareaProps = React.ComponentProps<'textarea'>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
    const fieldProps = useFieldControl(props);
    return (
        <textarea
            ref={ref}
            data-slot="textarea"
            className={cn(
                // Same shape, tokens and states as Input (Figma Dharma Input Group)
                'flex w-full min-w-0 rounded-ds-sm border-ds-1 px-2.5 py-1.5 outline-none transition-[background-color,border-color,color,box-shadow] duration-100 ease-in-out',
                'font-sans text-ds-sm font-ds-regular leading-ds-normal',
                'bg-surface-input border-border-input text-text-default placeholder:text-text-placeholder',
                'not-read-only:hover:border-border-input-hover',
                '[&:read-only:not(:disabled)]:bg-surface-input-muted [&:read-only:not(:disabled)]:border-border-default',
                'focus:border-focus-ring-default! focus:shadow-[inset_0_0_0_0.5px_var(--focus-ring-default)]',
                'aria-invalid:not-disabled:border-border-input-danger! aria-invalid:not-disabled:hover:border-border-input-danger-hover!',
                'aria-invalid:focus:border-focus-ring-danger! aria-invalid:focus:shadow-[inset_0_0_0_0.5px_var(--focus-ring-danger)]',
                'disabled:cursor-not-allowed disabled:bg-state-disabled! disabled:border-border-disabled! disabled:text-text-disabled disabled:placeholder:text-text-disabled',
                className
            )}
            {...props}
            {...fieldProps}
        />
    );
});
Textarea.displayName = 'Textarea';

export { Textarea };
