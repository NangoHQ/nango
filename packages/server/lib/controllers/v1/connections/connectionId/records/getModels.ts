import * as z from 'zod';

import { records as recordsService } from '@nangohq/records';
import { connectionService } from '@nangohq/shared';
import { requireEmptyBody, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, envSchema, providerConfigKeySchema } from '../../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';

import type { GetConnectionRecordModels } from '@nangohq/types';

const queryStringValidation = z
    .object({
        env: envSchema,
        provider_config_key: providerConfigKeySchema
    })
    .strict();

const paramValidation = z
    .object({
        connectionId: connectionIdSchema
    })
    .strict();

export const getConnectionRecordModels = asyncWrapper<GetConnectionRecordModels>(async (req, res) => {
    const emptyBody = requireEmptyBody(req);
    if (emptyBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
        return;
    }

    const queryParamValues = queryStringValidation.safeParse(req.query);
    if (!queryParamValues.success) {
        res.status(400).send({
            error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryParamValues.error) }
        });
        return;
    }

    const paramValues = paramValidation.safeParse(req.params);
    if (!paramValues.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramValues.error) }
        });
        return;
    }

    const { environment } = res.locals;
    const query = queryParamValues.data satisfies GetConnectionRecordModels['Querystring'];
    const params = paramValues.data satisfies GetConnectionRecordModels['Params'];

    const connection = await connectionService.getConnectionForPrivateApi({
        connectionId: params.connectionId,
        providerConfigKey: query.provider_config_key,
        environmentId: environment.id
    });

    if (connection.isErr()) {
        res.status(404).send({ error: { code: 'not_found', message: 'Failed to find connection' } });
        return;
    }

    const counts = await recordsService.getCountsByModel({
        connectionId: connection.value.connection.id,
        environmentId: environment.id
    });

    if (counts.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to fetch record models' } });
        return;
    }

    const data = Object.values(counts.value)
        .map((count) => {
            const { model, variant } = splitRecordModelName(count.model);

            return {
                model,
                variant,
                count: count.count,
                size_bytes: count.size_bytes,
                updated_at: count.updated_at
            };
        })
        .sort((left, right) => {
            const byModel = left.model.localeCompare(right.model);
            if (byModel !== 0) {
                return byModel;
            }

            return (left.variant || '').localeCompare(right.variant || '');
        });

    res.status(200).send({ data });
});

function splitRecordModelName(modelName: string): { model: string; variant: string | null } {
    const separatorIndex = modelName.indexOf('::');

    if (separatorIndex === -1) {
        return { model: modelName, variant: null };
    }

    return {
        model: modelName.slice(0, separatorIndex),
        variant: modelName.slice(separatorIndex + 2) || null
    };
}
