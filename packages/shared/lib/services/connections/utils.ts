import ms from 'ms';

import { decode as decodeJwt } from '../../auth/jwt.js';

import type { AllAuthCredentials, DBConnection, DBConnectionAsJSONRow } from '@nangohq/types';

export const DEFAULT_EXPIRES_AT_MS = ms('1day');
export const DEFAULT_OAUTHCC_EXPIRES_AT_MS = ms('55minutes'); // This ensures we have an expiresAt value
export const DEFAULT_INFINITE_EXPIRES_AT_MS = ms('99years');
export const MAX_CONSECUTIVE_DAYS_FAILED_REFRESH = 4;
export const REFRESH_FAILURE_COOLDOWN_MS = ms('30seconds');
export const REFRESH_MARGIN_MS = ms('15minutes');

export function getExpiresAtFromCredentials(credentials: AllAuthCredentials): Date | null {
    if (credentials.type === 'CUSTOM' && 'app' in credentials) {
        const appExpiresAt = credentials.app?.expires_at ? new Date(credentials.app.expires_at) : null;

        const userExpiresAt = credentials.user?.expires_at ? new Date(credentials.user.expires_at) : null;
        if (appExpiresAt && userExpiresAt) {
            return appExpiresAt < userExpiresAt ? appExpiresAt : userExpiresAt;
        }

        return appExpiresAt || userExpiresAt || new Date(Date.now() + DEFAULT_EXPIRES_AT_MS);
    }
    if ('expires_at' in credentials && credentials['expires_at']) {
        return credentials['expires_at'];
    }

    if (credentials.type === 'OAUTH1' || !credentials.type) {
        return new Date(Date.now() + DEFAULT_INFINITE_EXPIRES_AT_MS);
    }

    return new Date(Date.now() + DEFAULT_EXPIRES_AT_MS);
}

export function isConnectionJsonRow(connection: DBConnection | DBConnectionAsJSONRow): connection is DBConnectionAsJSONRow {
    return typeof connection.created_at === 'string';
}

export function jwtExpiresAt(token: string, marginMs: number): Date | undefined {
    const decoded = decodeJwt(token);
    if (decoded && typeof decoded['exp'] === 'number') {
        return new Date(decoded['exp'] * 1000 - marginMs);
    }
    return undefined;
}
