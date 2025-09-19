import * as z from 'zod';

import { connectionService } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { connectionSimpleToPublicApi } from '../../formatters/connection.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { bodySchema } from '../connect/postSessions.js';

import type { GetPublicConnections } from '@nangohq/types';

const validationQuery = z
    .object({
        connectionId: z.string().min(1).max(255).optional(),
        search: z.string().min(1).max(255).optional(),
        endUserId: bodySchema.shape.end_user.shape.id.optional(),
        endUserOrganizationId: bodySchema.shape.end_user.shape.id.optional()
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

    const { environment } = res.locals;
    const queryParam: GetPublicConnections['Querystring'] = queryParamValues.data;

    const connections = await connectionService.listConnections({
        environmentId: environment.id,
        connectionId: queryParam.connectionId,
        search: queryParam.search,
        endUserId: queryParam.endUserId,
        endUserOrganizationId: queryParam.endUserOrganizationId,
        limit: 10000
    });

    res.status(200).send({
        connections: connections.map((data) => {
            return connectionSimpleToPublicApi({
                data: data.connection,
                activeLog: data.active_logs,
                provider: data.provider,
                endUser: data.end_user
            });
        })
    });
});
