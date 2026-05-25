import { cva } from 'class-variance-authority';
import { Check } from 'lucide-react';

import { cn } from '../../lib/cn';

import type { VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

export const badgeVariants = cva(
    [
        'inline-flex items-center gap-[var(--ds-space-1)] border-[length:var(--ds-border-width-hairline)]',
        'text-[length:var(--ds-typography-font-size-xs)] [font-weight:var(--ds-typography-font-weight-medium)] leading-none',
        'px-[var(--ds-space-1-5)] h-[1.125rem]'
    ],
    {
        variants: {
            variant: {
                default: [
                    'bg-[var(--badge-default-bg)] text-[var(--badge-default-text)] border-[var(--badge-default-border)]',
                    '[&_svg]:text-[var(--badge-default-icon)]'
                ],
                secondary: [
                    'bg-[var(--badge-secondary-bg)] text-[var(--badge-secondary-text)] border-[var(--badge-secondary-border)]',
                    '[&_svg]:text-[var(--badge-secondary-icon)]'
                ],
                outline: [
                    'bg-[var(--badge-outline-bg)] text-[var(--badge-outline-text)] border-[var(--badge-outline-border)]',
                    '[&_svg]:text-[var(--badge-outline-icon)]'
                ],
                ghost: [
                    'bg-[var(--badge-ghost-bg)] text-[var(--badge-ghost-text)] border-[var(--badge-ghost-border)]',
                    '[&_svg]:text-[var(--badge-ghost-icon)]'
                ],
                danger: [
                    'bg-[var(--badge-danger-bg)] text-[var(--badge-danger-text)] border-[var(--badge-danger-border)]',
                    '[&_svg]:text-[var(--badge-danger-icon)]'
                ],
                verified: [
                    'bg-[var(--badge-verified-bg)] text-[var(--badge-verified-text)] border-[var(--badge-verified-border)]',
                    '[&_svg]:text-[var(--badge-verified-icon)]'
                ]
            },
            shape: {
                rectangle: 'rounded-[var(--ds-radius-xs)]',
                pill: 'rounded-[var(--ds-radius-full)]'
            }
        },
        defaultVariants: {
            variant: 'default',
            shape: 'rectangle'
        }
    }
);

export interface BadgeProps extends VariantProps<typeof badgeVariants> {
    className?: string;
    children: ReactNode;
    leadingIcon?: ReactNode;
}

export function Badge({ className, variant, shape, children, leadingIcon }: BadgeProps) {
    const showDefaultVerifiedIcon = variant === 'verified' && !leadingIcon;

    return (
        <span className={cn(badgeVariants({ variant, shape }), className)}>
            {showDefaultVerifiedIcon ? (
                <span className="shrink-0 [&_svg]:size-[0.625rem]">
                    <Check strokeWidth={2.5} />
                </span>
            ) : leadingIcon ? (
                <span className="shrink-0 [&_svg]:size-[0.625rem]">{leadingIcon}</span>
            ) : null}
            {children}
        </span>
    );
}
