import * as z from 'zod/v4';

import type { ApiKeyScope, SearchPeriod } from '@nangohq/types';

export const logsReadScope: ApiKeyScope = 'environment:logs:read';
export const defaultLimit = 25;
export const maxLimit = 500;

export const periodSchema = z
    .object({
        from: z.string().datetime(),
        to: z.string().datetime().optional()
    })
    .strict();

export function normalizePeriod(period: z.infer<typeof periodSchema>): SearchPeriod {
    return {
        from: period.from,
        to: period.to ?? new Date().toISOString()
    };
}
