import { getDisplayName } from '../utils';
import { CatalogBadge } from './CatalogBadge';

import type { AuthModeType } from '@nangohq/types';

interface AuthBadgeProps {
    authMode: AuthModeType;
    className?: string;
}

export const AuthBadge: React.FC<AuthBadgeProps> = ({ authMode, className }) => {
    return (
        <CatalogBadge variant="light" className={className}>
            {getDisplayName(authMode)}
        </CatalogBadge>
    );
};
