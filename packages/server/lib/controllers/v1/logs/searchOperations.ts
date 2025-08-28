import * as z from 'zod';

import { envs, modelMessages, modelOperations } from '@nangohq/logs';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { SearchOperations } from '@nangohq/types';

const validation = z
    .object({
        search: z.string().max(256).optional(),
        limit: z.number().max(500).optional().default(100),
        states: z
            .array(z.enum(['all', 'waiting', 'running', 'success', 'failed', 'timeout', 'cancelled']))
            .max(10)
            .optional()
            .default(['all']),
        types: z
            .array(
                z.enum([
                    'all',
                    'action',
                    'sync',
                    'events',
                    'sync:init',
                    'sync:cancel',
                    'sync:pause',
                    'sync:unpause',
                    'sync:run',
                    'sync:request_run',
                    'sync:request_run_full',
                    'proxy',
                    'deploy',
                    'auth',
                    'auth:create_connection',
                    'auth:refresh_token',
                    'admin',
                    'webhook',
                    'webhook:incoming',
                    'webhook:forward',
                    'webhook:sync',
                    'webhook:connection_create',
                    'webhook:connection_refresh'
                ])
            )
            .max(20)
            .optional()
            .default(['all']),
        integrations: z.array(z.string()).max(20).optional().default(['all']),
        connections: z.array(z.string()).max(20).optional().default(['all']),
        syncs: z.array(z.string()).max(20).optional().default(['all']),
        period: z.object({ from: z.string().datetime(), to: z.string().datetime() }).optional(),
        cursor: z.string().or(z.null()).optional()
    })
    .strict();

export const searchOperations = asyncWrapper<SearchOperations>(async (req, res) => {
    if (!envs.NANGO_LOGS_ENABLED) {
        res.status(404).send({ error: { code: 'feature_disabled' } });
        return;
    }

    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const env = res.locals['environment'];
    const body: SearchOperations['Body'] = val.data;

    const rawOps = await modelOperations.listOperations({
        accountId: env.account_id,
        environmentId: env.id,
        limit: body.limit!,
        states: body.states,
        types: body.types,
        integrations: body.integrations,
        connections: body.connections,
        syncs: body.syncs,
        period: body.period,
        cursor: body.cursor
    });
    if (body.search && rawOps.items.length > 0) {
        const bucket = await modelMessages.searchForMessagesInsideOperations({ search: body.search, operationsIds: rawOps.items.map((op) => op.id) });
        const matched = new Set(bucket.items.map((item) => item.key));
        rawOps.items = rawOps.items.filter((item) => matched.has(item.id));
    }

    res.status(200).send({
        data: rawOps.items,
        pagination: { total: rawOps.count, cursor: rawOps.cursor }
    });
});
