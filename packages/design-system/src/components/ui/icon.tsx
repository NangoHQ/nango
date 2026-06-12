import { cn } from '../../lib/cn';

import type { LucideIcon } from 'lucide-react';

// Pixel values sourced from --ds-icon-size-* tokens
const SIZES: Record<IconSize, number> = {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24
};

// Stroke widths sourced from --ds-icon-stroke-* tokens (no xl token; lg value used)
const STROKE_WIDTHS: Record<IconSize, number> = {
    xs: 0.5,
    sm: 1,
    md: 1.3,
    lg: 1.5,
    xl: 1.5
};

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface IconProps {
    icon: LucideIcon;
    size?: IconSize;
    strokeWidth?: number;
    className?: string;
    'aria-label'?: string;
    'aria-hidden'?: boolean | 'true' | 'false';
}

export function Icon({ icon: LucideIconComponent, size = 'md', strokeWidth, className, 'aria-label': ariaLabel, 'aria-hidden': ariaHidden = true }: IconProps) {
    return (
        <LucideIconComponent
            size={SIZES[size]}
            strokeWidth={strokeWidth ?? STROKE_WIDTHS[size]}
            className={cn('shrink-0', className)}
            aria-label={ariaLabel}
            aria-hidden={ariaHidden}
        />
    );
}
