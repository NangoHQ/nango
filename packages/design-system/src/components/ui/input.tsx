import { cva } from 'class-variance-authority';
import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState } from 'react';

import { IconButton } from './icon-button';
import { cn } from '../../lib/cn';

import type { VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

const inputWrapperVariants = cva(
    [
        'flex items-center gap-[var(--ds-space-1-5)]',
        'rounded-[var(--ds-radius-sm)] border-[length:var(--ds-border-width-1)]',
        'bg-[var(--input-bg-default)]',
        'transition-[border-color,box-shadow]',
        'duration-[var(--ds-motion-duration-fast)] ease-[var(--ds-motion-easing-standard)]',
        'has-[:focus-visible]:outline-none has-[:focus-visible]:shadow-[var(--focus-outline-default)]',
        'has-[:disabled]:bg-[var(--input-bg-disabled)] has-[:disabled]:cursor-not-allowed'
    ],
    {
        variants: {
            invalid: {
                false: [
                    'border-[var(--input-border-default)]',
                    'hover:border-[var(--input-border-hover)]',
                    'has-[:disabled]:border-[var(--input-border-disabled)] has-[:disabled]:hover:border-[var(--input-border-disabled)]'
                ],
                true: [
                    'border-[var(--input-border-error)]',
                    'hover:border-[var(--input-border-error)]',
                    'has-[:focus-visible]:shadow-[var(--focus-outline-danger)]'
                ]
            },
            size: {
                md: 'h-8 px-[var(--ds-space-2-5)] py-[var(--ds-space-1)]'
            }
        },
        defaultVariants: {
            invalid: false,
            size: 'md'
        }
    }
);

const inputFieldVariants = cva(
    [
        'flex-1 min-w-0 bg-transparent border-none outline-none',
        'text-[length:var(--ds-typography-font-size-md)] text-[var(--input-text-default)]',
        '[font-weight:var(--ds-typography-font-weight-regular)]',
        'leading-[1.5] tracking-[var(--ds-typography-letter-spacing-normal)]',
        'placeholder:text-[var(--text-disabled)]',
        'disabled:text-[var(--input-text-disabled)] disabled:cursor-not-allowed'
    ],
    {
        variants: {}
    }
);

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>, Pick<VariantProps<typeof inputWrapperVariants>, 'size'> {
    invalid?: boolean;
    leadingIcon?: ReactNode;
    trailingIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, invalid = false, leadingIcon, trailingIcon, size, type, ...props }, ref) => {
    return (
        <div className={cn(inputWrapperVariants({ invalid, size }), className)}>
            {leadingIcon && <span className="shrink-0 text-[var(--icon-secondary)] [&_svg]:size-[var(--ds-icon-size-sm)]">{leadingIcon}</span>}
            <input ref={ref} type={type ?? 'text'} className={cn(inputFieldVariants())} aria-invalid={invalid || undefined} {...props} />
            {trailingIcon && <span className="shrink-0 text-[var(--icon-secondary)] [&_svg]:size-[var(--ds-icon-size-sm)]">{trailingIcon}</span>}
        </div>
    );
});

Input.displayName = 'Input';

export type PasswordInputProps = Omit<InputProps, 'type' | 'trailingIcon'>;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(({ className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
        <Input
            ref={ref}
            type={visible ? 'text' : 'password'}
            className={className}
            trailingIcon={
                <IconButton size="xs" variant="ghost" label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible((v) => !v)} type="button">
                    {visible ? <EyeOff size={14} /> : <Eye size={14} />}
                </IconButton>
            }
            {...props}
        />
    );
});

PasswordInput.displayName = 'PasswordInput';
