import ms from 'ms';

export const SYNC_TIMEOUT = '24h';
export const SYNC_MAX_ATTEMPTS = 3;
export const MAX_SYNC_DURATION = ms(SYNC_TIMEOUT);

export const ACTION_TIMEOUT = '15m';
export const ACTION_MAX_ATTEMPTS = 1; // no retry
export const MAX_ACTION_DURATION = ms(ACTION_TIMEOUT);

export const WEBHOOK_TIMEOUT = '15m';
export const WEBHOOK_MAX_ATTEMPTS = 3;
export const MAX_WEBHOOK_DURATION = ms(WEBHOOK_TIMEOUT);
