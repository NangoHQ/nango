import * as React from 'react';

import { cn } from '@/utils/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
    return (
        <textarea
            data-slot="textarea"
            className={cn(
                'bg-surface-input border border-border-input text-text-strong !text-body-medium-regular placeholder:text-text-muted hover:border-border-input-hover focus:border-border-input-hover data-[filled=true]:not-aria-invalid:border-border-input-hover',
                'flex w-full min-w-0 rounded px-3 py-1 shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
                'aria-invalid:focus-error aria-invalid:border-border-danger',
                className
            )}
            {...props}
        />
    );
}

export { Textarea };
