import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { GetPublicConnections } from '@nangohq/types';
import { AnalyticsTypes, analytics, connectionService } from '@nangohq/shared';
import { connectionToPublicApi } from '../../formatters/connection.js';

export const getPublicConnections = asyncWrapper<GetPublicConnections>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { environment, account } = res.locals;

    void analytics.track(AnalyticsTypes.CONNECTION_LIST_FETCHED, account.id);
    const connections = await connectionService.listConnections({ environmentId: environment.id, limit: 10000 });

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
