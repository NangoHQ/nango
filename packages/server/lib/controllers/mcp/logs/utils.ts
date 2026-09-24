import type { Period } from './schema.js';
import type { ApiKeyScope, SearchPeriod } from '@nangohq/types';

export const logsReadScope: ApiKeyScope = 'environment:logs:read';
export const defaultLimit = 25;
export const maxLimit = 500;

export function normalizePeriod(period: Period): SearchPeriod {
    return {
        from: period.from,
        to: period.to ?? new Date().toISOString()
    };
}
