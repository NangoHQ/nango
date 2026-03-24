import * as z from 'zod';

import { connectionService, getSyncsByIds } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { connectionSimpleToApi } from '../../../formatters/connection.js';
import { envSchema, providerConfigKeySchema } from '../../../helpers/validation.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../../utils/utils.js';

import type { GetConnections } from '@nangohq/types';

const orchestrator = getOrchestrator();

const queryStringValidation = z
    .object({
        integrationIds: z
            .string()
            .optional()
            .transform((value) => value?.split(','))
            .pipe(z.array(providerConfigKeySchema))
            .optional(),
        search: z.string().max(255).optional(),
        withError: z.stringbool().optional(),
        env: envSchema,
        page: z.coerce.number().min(0).max(50).optional()
    })
    .strict();

export const getConnections = asyncWrapper<GetConnections>(async (req, res) => {
    const queryStringValues = queryStringValidation.safeParse(req.query);
    if (!queryStringValues.success) {
        res.status(400).send({
            error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryStringValues.error) }
        });
        return;
    }

    const { environment } = res.locals;
    const queryString = queryStringValues.data satisfies GetConnections['Querystring'];

    const connections = await connectionService.listConnections({
        environmentId: environment.id,
        limit: 20,
        page: queryString.page,
        search: queryString.search,
        integrationIds: queryString.integrationIds,
        withError: queryString.withError
    });

    const pausedConnectionIds = new Set<number>();
    const pausedSyncsResult = await orchestrator.getPausedSyncsByEnvironment({ environmentId: environment.id });
    if (pausedSyncsResult.isOk() && pausedSyncsResult.value.length > 0) {
        const syncs = await getSyncsByIds({ syncIds: pausedSyncsResult.value });
        for (const sync of syncs) {
            pausedConnectionIds.add(sync.nango_connection_id);
        }
    }

    res.status(200).send({
        data: connections.map((data) => {
            return connectionSimpleToApi({
                data: data.connection,
                provider: data.provider,
                activeLog: data.active_logs,
                endUser: data.end_user,
                hasPausedSyncs: pausedConnectionIds.has(data.connection.id)
            });
        })
    });
});
