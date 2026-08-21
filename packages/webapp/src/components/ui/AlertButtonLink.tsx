import * as React from 'react';
import { Link } from 'react-router-dom';

import { alertButtonVariants } from '@nangohq/design-system';

import { cn } from '@/utils/utils';

import type { LinkProps } from 'react-router-dom';

/**
 * A react-router `<Link>` styled as a design-system `AlertButton`.
 *
 * The design system intentionally ships no link-as-button component (to avoid coupling react-router
 * into it), so this thin wrapper lives in the webapp and reuses `alertButtonVariants`. Colour comes
 * from the parent `Alert`'s status via `--alert-link`, so there is no variant to pass.
 */
export const AlertButtonLink = React.forwardRef<HTMLAnchorElement, LinkProps>(({ className, ...props }, ref) => (
    <Link ref={ref} data-slot="alert-button" className={cn(alertButtonVariants(), className)} {...props} />
));
AlertButtonLink.displayName = 'AlertButtonLink';
