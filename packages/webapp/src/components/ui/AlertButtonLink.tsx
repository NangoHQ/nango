import * as React from 'react';
import { Link } from 'react-router-dom';

import { AlertButton } from '@nangohq/design-system';

import type { LinkProps } from 'react-router-dom';

/**
 * A react-router `<Link>` rendered as a design-system `AlertButton`.
 *
 * The design system intentionally ships no react-router dependency, so this thin wrapper lives in the webapp.
 * `AlertButton` takes its LinkButton tone from the parent `Alert`, so there is no variant to pass.
 */
export const AlertButtonLink = React.forwardRef<HTMLAnchorElement, LinkProps>((props, ref) => (
    <AlertButton asChild>
        <Link ref={ref} {...props} />
    </AlertButton>
));
AlertButtonLink.displayName = 'AlertButtonLink';
