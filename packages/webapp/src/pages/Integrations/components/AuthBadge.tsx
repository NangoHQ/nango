import { Badge } from '@nangohq/design-system';

import { getDisplayName } from '../utils';

import type { AuthModeType } from '@nangohq/types';

interface AuthBadgeProps {
    authMode: AuthModeType;
}

export const AuthBadge: React.FC<AuthBadgeProps> = ({ authMode }) => {
    return <Badge variant="secondary">{getDisplayName(authMode)}</Badge>;
};
