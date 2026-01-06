import { KeyRound, Lock, LockOpen, RectangleEllipsis, Shield, Signature, Sparkles } from 'lucide-react';

import { getDisplayName } from '../utils';
import { Badge } from '@/components-v2/ui/badge';

import type { AuthModeType } from '@nangohq/types';

interface AuthBadgeProps {
    authMode: AuthModeType;
    className?: string;
}

/**
 * Returns the appropriate icon for each auth mode type
 */
const getIcon = (authMode: AuthModeType) => {
    switch (authMode) {
        case 'API_KEY':
            return <KeyRound />;
        case 'BASIC':
            return <RectangleEllipsis />;
        case 'SIGNATURE':
            return <Signature />;
        case 'TWO_STEP':
            return <Shield />;
        case 'MCP_OAUTH2':
        case 'MCP_OAUTH2_GENERIC':
            return <Sparkles />;
        case 'OAUTH2_CC':
            return <KeyRound />;
        case 'NONE':
            return <LockOpen />;
        // Fallback for any unknown auth modes
        default:
            return <Lock />;
    }
};

export const AuthBadge: React.FC<AuthBadgeProps> = ({ authMode, className }) => {
    return (
        <Badge variant="gray" className={className}>
            {getIcon(authMode)} {getDisplayName(authMode)}
        </Badge>
    );
};
