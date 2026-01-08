import { getDisplayName } from '../utils';
import { CatalogBadge } from './CatalogBadge';

import type { AuthModeType } from '@nangohq/types';

interface AuthBadgeProps {
    authMode: AuthModeType;
    className?: string;
    variant?: 'light' | 'dark';
}

export const AuthBadge: React.FC<AuthBadgeProps> = ({ authMode, className, variant = 'light' }) => {
    return (
        <CatalogBadge variant={variant} className={className}>
            {getDisplayName(authMode)}
        </CatalogBadge>
    );
};
