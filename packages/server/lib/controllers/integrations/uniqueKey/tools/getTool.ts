import tracer from 'dd-trace';
import * as z from 'zod';

import { configService, toolService } from '@nangohq/shared';
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

    try {
        const integration = await configService.getProviderConfig(uniqueKey, environment.id);
        if (!integration) {
            res.status(404).send({ error: { code: 'not_found', message: `Tool '${name}' for integration ${uniqueKey} was not found` } });
            return;
        }
        const resolved = await toolService.resolveTool({
            accountUuid: res.locals.account.uuid,
            environmentId: environment.id,
            integration,
            name
        });
        if (resolved.isErr()) {
            throw resolved.error;
        }
        const tool = resolved.value;
        if (tool.kind === 'function') {
            if (tool.fn.config.enabled) {
                res.status(200).send(toGetToolResponse(tool.fn));
                return;
            }
        } else if (tool.kind !== 'missing' && (tool.kind === 'catalog' || tool.config.enabled)) {
            res.status(200).send(actionToGetToolResponse(tool, integration));
            return;
        }
    } catch (err) {
        tracer.scope().active()?.setTag('error', err);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to fetch tool' } });
        return;
    }

    res.status(404).send({ error: { code: 'not_found', message: `Tool '${name}' for integration ${uniqueKey} was not found` } });
});
