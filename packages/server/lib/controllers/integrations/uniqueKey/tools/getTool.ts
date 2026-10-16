import tracer from 'dd-trace';
import * as z from 'zod';

import db from '@nangohq/database';
import { configService, functionConfigService, resolveRunnableTool } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { scriptNameSchema } from '../../../../helpers/validation.js';
import { asyncWrapperWithEnvironment } from '../../../../utils/asyncWrapper.js';
import { actionToGetToolResponse, toGetToolResponse } from '../../../functions/formatter.js';
import { functionIntegrationIdSchema } from '../../../functions/validation.js';

import type { GetTool } from '@nangohq/types';

const paramsSchema = z
    .object({
        uniqueKey: functionIntegrationIdSchema,
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
    if (fn) {
        res.status(200).send(toGetToolResponse(fn));
        return;
    }

    try {
        const integration = await configService.getProviderConfig(uniqueKey, environment.id);
        if (!integration) {
            res.status(404).send({ error: { code: 'not_found', message: `Tool '${name}' for integration ${uniqueKey} was not found` } });
            return;
        }
        const resolved = await resolveRunnableTool({
            accountUuid: res.locals.account.uuid,
            environmentId: environment.id,
            integration,
            name
        });
        if (resolved.kind !== 'missing' && (resolved.kind === 'catalog' || resolved.config.enabled)) {
            res.status(200).send(actionToGetToolResponse(resolved, integration));
            return;
        }
    } catch (err) {
        tracer.scope().active()?.setTag('error', err);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to fetch tool' } });
        return;
    }

    res.status(404).send({ error: { code: 'not_found', message: `Tool '${name}' for integration ${uniqueKey} was not found` } });
});
