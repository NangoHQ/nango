import * as z from 'zod';

import { connectionTagsSchema } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { connectionSimpleToPublicApi } from '../../formatters/connection.js';
import { hasScope } from '../../middleware/scope.middleware.js';
import connectionService from '../../services/connection.service.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { bodySchema } from '../connect/postSessions.js';

import type { GetPublicConnections } from '@nangohq/types';

const validationQuery = z
    .object({
        connectionId: z.string().min(1).max(255).optional(),
        search: z.string().min(1).max(255).optional(),
        endUserId: bodySchema.shape.end_user.shape.id.optional(),
        integrationId: z.string().min(1).optional(),
        endUserOrganizationId: bodySchema.shape.end_user.shape.id.optional(),
        tags: connectionTagsSchema.optional(),
        limit: z.coerce.number().min(1).max(2000).optional(),
        page: z.coerce.number().min(0).optional()
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
    const queryParam = queryParamValues.data;

    const connections = await connectionService.list({
        environmentId: environment.id,
        connectionId: queryParam.connectionId,
        search: queryParam.search,
        endUserId: queryParam.endUserId,
        integrationIds: queryParam.integrationId ? queryParam.integrationId.split(',').map((id) => id.trim()) : undefined,
        endUserOrganizationId: queryParam.endUserOrganizationId,
        tags: queryParam.tags,
        page: queryParam.page,
        limit: queryParam.limit,
        includeCredentials: hasScope({
            grantedScopes: res.locals['apiKeyScopes'],
            requiredScope: 'environment:connections:list_credentials'
        })
    });
    if (connections.isErr()) {
        throw connections.error;
    }

    res.status(200).send({
        connections: connections.value.map((connection) => connectionSimpleToPublicApi(connection))
    });
});
