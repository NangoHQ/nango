import ms from 'ms';

import type { AllAuthCredentials, DBConnection, DBConnectionAsJSONRow } from '@nangohq/types';

export const DEFAULT_EXPIRES_AT_MS = ms('1day');
export const DEFAULT_OAUTHCC_EXPIRES_AT_MS = ms('55minutes'); // This ensures we have an expiresAt value
export const DEFAULT_INFINITE_EXPIRES_AT_MS = ms('99years');
export const MAX_CONSECUTIVE_DAYS_FAILED_REFRESH = 4;
export const REFRESH_MARGIN_S = ms('15minutes') / 1000;

export function getExpiresAtFromCredentials(credentials: AllAuthCredentials): Date | null {
    if (credentials.type === 'CUSTOM' && 'app' in credentials) {
        const appExpiresAt = credentials.app?.expires_at ? new Date(credentials.app.expires_at) : null;

        const userExpiresAt = credentials.user?.expires_at ? new Date(credentials.user.expires_at) : null;
        console.log('this is the app expirationa', appExpiresAt);
        console.log('this is the user expirations', userExpiresAt);

        if (appExpiresAt && userExpiresAt) {
            return appExpiresAt < userExpiresAt ? appExpiresAt : userExpiresAt;
        }

        return appExpiresAt || userExpiresAt || new Date(Date.now() + DEFAULT_EXPIRES_AT_MS);
    }

    if ('expires_at' in credentials && credentials['expires_at']) {
        return credentials['expires_at'];
    }

    if (credentials.type === 'OAUTH1' || credentials.type === 'APP_STORE' || !credentials.type) {
        return new Date(Date.now() + DEFAULT_INFINITE_EXPIRES_AT_MS);
    }

    return new Date(Date.now() + DEFAULT_EXPIRES_AT_MS);
}

export function isConnectionJsonRow(connection: DBConnection | DBConnectionAsJSONRow): connection is DBConnectionAsJSONRow {
    return typeof connection.created_at === 'string';
}
