import { KeyRound, Lock, LockOpen } from 'lucide-react';

import { Badge } from '@/components-v2/ui/badge';

import type { AuthModeType } from '@nangohq/types';

interface AuthBadgeProps {
    authMode: AuthModeType;
}

export const AuthBadge: React.FC<AuthBadgeProps> = ({ authMode }) => {
    switch (authMode) {
        case 'OAUTH1':
            return (
                <Badge variant="gray">
                    <Lock />
                    OAUTH
                </Badge>
            );
        case 'OAUTH2':
            return (
                <Badge variant="gray">
                    <Lock />
                    OAUTH 2
                </Badge>
            );
        case 'BASIC':
            return (
                <Badge variant="gray">
                    <LockOpen />
                    BASIC
                </Badge>
            );
        case 'API_KEY':
            return (
                <Badge variant="gray">
                    <KeyRound />
                    API KEY
                </Badge>
            );
        default:
            return (
                <Badge variant="gray">
                    <LockOpen /> {authMode}
                </Badge>
            );
    }
};
