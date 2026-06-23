import * as React from 'react';

import { cn } from '../../lib/cn';

export type InputProps = React.ComponentProps<'input'>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, autoComplete, ...props }, ref) => {
    const blockPasswordManager = !autoComplete || autoComplete === 'off';
    return (
        <input
            ref={ref}
            type={type}
            data-slot="input"
            className={cn(
                // Shape + spacing (Figma: hairline border, radius/sm, space/2 × space/1.5)
                'flex h-9 w-full min-w-0 rounded border-ds-hairline px-2 py-1.5 outline-none transition-[color,box-shadow]',
                // Typography (Figma text/regular/md)
                'text-ds-md font-ds-regular leading-ds-normal',
                // Default colors
                'bg-surface-input border-border-input text-text-default placeholder:text-text-secondary',
                // Hover / focus border (focus ring removed pending design review)
                'hover:border-border-input-hover focus:border-border-input-hover',
                // Invalid
                'aria-invalid:border-status-danger-border',
                // Disabled — dedicated tokens, no opacity (Figma state/selectedMuted bg, border/disabled, text/disabled)
                'disabled:cursor-not-allowed disabled:border-border-disabled disabled:bg-state-selected-muted disabled:text-text-disabled disabled:placeholder:text-text-disabled',
                // File-input affordance
                'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-text-strong file:text-ds-md file:font-ds-medium',
                className
            )}
            autoComplete={autoComplete ?? 'off'}
            {...(blockPasswordManager ? { 'data-1p-ignore': true, 'data-lpignore': 'true', 'data-protonpass-ignore': 'true' } : {})}
            {...props}
        />
    );
});
Input.displayName = 'Input';

export { Input };
