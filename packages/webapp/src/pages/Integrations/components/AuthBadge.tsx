import { KeyRound, Lock, LockOpen, RectangleEllipsis, Shield, Signature, Sparkles } from 'lucide-react';

import { Badge } from '@/components-v2/ui/badge';

import type { AuthModeType } from '@nangohq/types';

interface AuthBadgeProps {
    authMode: AuthModeType;
}

/**
 * Maps auth mode types to human-readable display names
 */
const getDisplayName = (authMode: AuthModeType): string => {
    const displayNames: Record<AuthModeType, string> = {
        API_KEY: 'API Key',
        BASIC: 'Basic',
        SIGNATURE: 'Signature',
        TWO_STEP: 'Two Step',
        MCP_OAUTH2: 'MCP OAuth2',
        MCP_OAUTH2_GENERIC: 'MCP OAuth2 Generic',
        NONE: 'None',
        OAUTH1: 'OAuth1',
        OAUTH2: 'OAuth2',
        OAUTH2_CC: 'OAuth2 Client Credentials',
        APP: 'App',
        APP_STORE: 'App Store',
        CUSTOM: 'Custom',
        TBA: 'TBA',
        JWT: 'JWT',
        BILL: 'Bill'
    };

    return displayNames[authMode] || authMode.replaceAll('_', ' ').toUpperCase();
};

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

export const AuthBadge: React.FC<AuthBadgeProps> = ({ authMode }) => {
    return (
        <Badge variant="gray">
            {getIcon(authMode)} {getDisplayName(authMode)}
        </Badge>
    );
};
