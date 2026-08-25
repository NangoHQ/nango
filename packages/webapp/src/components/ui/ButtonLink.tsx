import * as React from 'react';
import { Link } from 'react-router-dom';

import { buttonVariants } from '@nangohq/design-system';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';
import type { LinkProps } from 'react-router-dom';

type ButtonLinkProps = LinkProps &
    VariantProps<typeof buttonVariants> & {
        disabled?: boolean;
    };

/**
 * A react-router `<Link>` styled as a design-system Button.
 *
 * The design system intentionally ships no link-as-button component (to avoid coupling react-router into it),
 * so this thin wrapper lives in the webapp and reuses the design-system `buttonVariants`. `variant` and `size`
 * therefore accept the design-system vocabulary.
 */
export const ButtonLink = React.forwardRef<HTMLAnchorElement, ButtonLinkProps>(({ className, variant, size, disabled, onClick, ...props }, ref) => {
    return (
        <Link
            ref={ref}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : undefined}
            className={cn(buttonVariants({ variant, size }), className)}
            onClick={disabled ? (e) => e.preventDefault() : onClick}
            {...props}
        />
    );
});
ButtonLink.displayName = 'ButtonLink';
