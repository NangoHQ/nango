import { Link } from 'react-router-dom';

import { Button } from '@nangohq/design-system';

export const RbacUpgradePrompt = () => (
    <p className="text-body-small-regular text-text-secondary">
        Support and Contributor roles require the Growth add-on.{' '}
        <Button asChild variant="link-accent" size="xs">
            <Link to="/team/billing#plans">Upgrade</Link>
        </Button>
    </p>
);
