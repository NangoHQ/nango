import { z } from 'zod';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { zodErrorToHTTP } from '@nangohq/utils';
import type { GetPublicConnections } from '@nangohq/types';
import { envSchema } from '../../helpers/validation.js';
import { AnalyticsTypes, analytics, connectionService } from '@nangohq/shared';

const queryStringValidation = z
    .object({
        connectionId: z.string().max(255).optional(),
        env: envSchema
    })
    .strict();

export const getPublicConnections = asyncWrapper<GetPublicConnections>(async (req, res) => {
    const queryStringValues = queryStringValidation.safeParse(req.query);
    if (!queryStringValues.success) {
        res.status(400).send({
            error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryStringValues.error) }
        });
        return;
    }

    const { environment, account } = res.locals;
    const { connectionId }: GetPublicConnections['Querystring'] = queryStringValues.data;

    void analytics.track(AnalyticsTypes.CONNECTION_LIST_FETCHED, account.id);
    const connections = await connectionService.listConnections({ environmentId: environment.id, search: connectionId });

    res.status(200).send({
        connections: connections.map((data) => {
            return data.connection;
        })
    });
});
