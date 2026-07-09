import * as z from 'zod/v4';

import { logsDisabledErrorMessage, envs as logsEnvs } from '@nangohq/logs';
import { Err, Ok } from '@nangohq/utils';

import { PublicMcpError } from '../utils.js';

import type { ApiKeyScope, SearchPeriod } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export const logsReadScope: ApiKeyScope = 'environment:logs:read';
export const defaultLimit = 25;
export const maxLimit = 500;

export const periodSchema = z
    .object({
        from: z.string().datetime(),
        to: z.string().datetime().optional()
    })
    .strict();

export function checkLogsEnabled(): Result<void> {
    if (!logsEnvs.NANGO_LOGS_ENABLED) {
        return Err(new PublicMcpError(logsDisabledErrorMessage));
    }

    return Ok();
}

export function normalizePeriod(period: z.infer<typeof periodSchema>): SearchPeriod {
    return {
        from: period.from,
        to: period.to ?? new Date().toISOString()
    };
}
