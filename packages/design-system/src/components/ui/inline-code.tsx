import { cva } from 'class-variance-authority';
import { createContext, forwardRef, useContext } from 'react';

import { cn } from '../../lib/cn';

export type InlineCodeTone = 'default' | 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type InlineCodeSize = 'sm' | 'xs';

const InlineCodeToneContext = createContext<InlineCodeTone | undefined>(undefined);

/** Sets the tone every `InlineCode` below it takes when it isn't given one. */
export const InlineCodeToneProvider = InlineCodeToneContext.Provider;

export const inlineCodeVariants = cva('box-decoration-clone wrap-anywhere rounded-ds-xs px-1', {
    variants: {
        tone: {
            default: 'bg-state-selected text-text-default',
            neutral: 'bg-surface-panel inset-ring-[0.5px] inset-ring-border-default text-text-default',
            info: 'bg-surface-panel inset-ring-[0.5px] inset-ring-status-info-border text-status-info-text',
            success: 'bg-surface-panel inset-ring-[0.5px] inset-ring-status-success-border text-status-success-text',
            warning: 'bg-surface-panel inset-ring-[0.5px] inset-ring-status-warning-border text-status-warning-text',
            danger: 'bg-surface-panel inset-ring-[0.5px] inset-ring-status-danger-border text-status-danger-text'
        },
        size: {
            sm: 'type-code-regular-sm',
            xs: 'type-code-regular-xs'
        }
    },
    defaultVariants: {
        tone: 'default',
        size: 'sm'
    }
});

export interface InlineCodeProps extends React.ComponentProps<'code'> {
    /** Falls back to the surrounding `Alert`'s status, then `default`. */
    tone?: InlineCodeTone;
    size?: InlineCodeSize;
}

export const InlineCode = forwardRef<HTMLElement, InlineCodeProps>(({ className, tone, size, ...props }, ref) => {
    const contextTone = useContext(InlineCodeToneContext);
    return <code ref={ref} data-slot="inline-code" className={cn(inlineCodeVariants({ tone: tone ?? contextTone, size }), className)} {...props} />;
});
InlineCode.displayName = 'InlineCode';
