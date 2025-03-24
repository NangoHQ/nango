import ms from 'ms';

import type { AllAuthCredentials, DBConnection, DBConnectionAsJSONRow } from '@nangohq/types';

export const DEFAULT_EXPIRES_AT_MS = ms('1day');
export const DEFAULT_OAUTHCC_EXPIRES_AT_MS = ms('55minutes'); // This ensures we have an expiresAt value
export const DEFAULT_BILL_EXPIRES_AT_MS = ms('35minutes'); //This ensures we have an expireAt value for Bill
export const DEFAULT_INFINITE_EXPIRES_AT_MS = ms('99years');
export const MAX_CONSECUTIVE_DAYS_FAILED_REFRESH = 4;
export const REFRESH_MARGIN_S = ms('15minutes') / 1000;

export function getExpiresAtFromCredentials(credentials: AllAuthCredentials): Date | null {
    if ('expires_at' in credentials && credentials['expires_at']) {
        return credentials['expires_at'];
    }

    if (credentials.type === 'CUSTOM' || credentials.type === 'OAUTH1' || credentials.type === 'APP_STORE' || !credentials.type) {
        return new Date(Date.now() + DEFAULT_INFINITE_EXPIRES_AT_MS);
    }

    return new Date(Date.now() + DEFAULT_EXPIRES_AT_MS);
}

export function isConnectionJsonRow(connection: DBConnection | DBConnectionAsJSONRow): connection is DBConnectionAsJSONRow {
    return typeof connection.created_at === 'string';
}
