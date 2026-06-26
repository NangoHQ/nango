import * as z from 'zod/v4';

import { envs as logsEnvs } from '@nangohq/logs';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
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

export function assertLogsEnabled() {
    if (!logsEnvs.NANGO_LOGS_ENABLED) {
        throw new Error('Nango logs are disabled');
    }
}

export function jsonContent(data: unknown): CallToolResult {
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(data, null, 2)
            }
        ]
    };
}

export function normalizePeriod(period: z.infer<typeof periodSchema>): SearchPeriod {
    return {
        from: period.from,
        to: period.to ?? new Date().toISOString()
    };
}
