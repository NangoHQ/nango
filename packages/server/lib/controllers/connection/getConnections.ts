import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { zodErrorToHTTP } from '@nangohq/utils';
import type { GetPublicConnections } from '@nangohq/types';
import { AnalyticsTypes, analytics, connectionService } from '@nangohq/shared';
import { connectionToPublicApi } from '../../formatters/connection.js';
import { z } from 'zod';

const validationQuery = z
    .object({
        connectionId: z.string().min(1).max(255).optional(),
        search: z.string().min(1).max(255).optional()
    })
    .strict();

export const getPublicConnections = asyncWrapper<GetPublicConnections>(async (req, res) => {
    const queryParamValues = validationQuery.safeParse(req.query);
    if (!queryParamValues.success) {
        res.status(400).send({
            error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryParamValues.error) }
        });
        return;
    }

    const { environment, account } = res.locals;
    const queryParam: GetPublicConnections['Querystring'] = queryParamValues.data;

    void analytics.track(AnalyticsTypes.CONNECTION_LIST_FETCHED, account.id);
    const connections = await connectionService.listConnections({
        environmentId: environment.id,
        connectionId: queryParam.connectionId,
        search: queryParam.search,
        limit: 10000
    });

    res.status(200).send({
        connections: connections.map((data) => {
            // TODO: return end_user
            return connectionToPublicApi({
                data: data.connection,
                activeLog: data.active_logs,
                provider: data.provider
            });
        })
    });
});
