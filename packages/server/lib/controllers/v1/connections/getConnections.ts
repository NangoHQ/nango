import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { zodErrorToHTTP } from '@nangohq/utils';
import type { GetConnections } from '@nangohq/types';
import { envSchema, providerConfigKeySchema, stringBool } from '../../../helpers/validation.js';
import { connectionService } from '@nangohq/shared';
import { connectionSimpleToApi } from '../../../formatters/connection.js';

const queryStringValidation = z
    .object({
        integrationIds: z
            .string()
            .optional()
            .transform((value) => value?.split(','))
            .pipe(z.array(providerConfigKeySchema))
            .optional(),
        search: z.string().max(255).optional(),
        withError: stringBool.optional(),
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

    res.status(200).send({
        data: connections.map((data) => {
            return connectionSimpleToApi({ data: data.connection, provider: data.provider, activeLog: data.active_logs, endUser: data.end_user });
        })
    });
});
