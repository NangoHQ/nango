import tracer from 'dd-trace';
import * as z from 'zod';

import db from '@nangohq/database';
import { functionConfigService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { providerConfigKeySchema, scriptNameSchema } from '../../../../helpers/validation.js';
import { asyncWrapperWithEnvironment } from '../../../../utils/asyncWrapper.js';
import { toGetToolResponse } from '../../../functions/formatter.js';

import type { GetTool } from '@nangohq/types';

const paramsSchema = z
    .object({
        uniqueKey: providerConfigKeySchema,
        name: scriptNameSchema
    })
    .strict();

export const getTool = asyncWrapperWithEnvironment<GetTool>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const params = paramsSchema.safeParse(req.params);
    if (!params.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(params.error) } });
        return;
    }

    const { environment } = res.locals;
    const { uniqueKey, name } = params.data;

    const result = await functionConfigService.search(db.knex, {
        environmentId: environment.id,
        filter: { integrationKey: uniqueKey, name, enabled: true, trigger: { kind: 'http' } }
    });
    if (result.isErr()) {
        tracer.scope().active()?.setTag('error', result.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to fetch tool' } });
        return;
    }

    const fn = result.value[0];
    if (!fn) {
        res.status(404).send({ error: { code: 'not_found', message: `Tool '${name}' for integration ${uniqueKey} was not found` } });
        return;
    }

    res.status(200).send(toGetToolResponse(fn));
});
