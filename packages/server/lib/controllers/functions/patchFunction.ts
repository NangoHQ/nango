import tracer from 'dd-trace';
import { z } from 'zod';

import { functionLifecycle } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';
import { toGetFunctionResponse } from './helpers.js';

import type { PatchFunction } from '@nangohq/types';

const paramsSchema = z.object({ uuid: z.uuid() }).strict();
const bodySchema = z.object({ state: z.enum(['enabled', 'disabled']) }).strict();

export const patchFunction = asyncWrapperWithEnvironment<PatchFunction>(async (req, res) => {
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

    const body = bodySchema.safeParse(req.body);
    if (!body.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(body.error) } });
        return;
    }

    const { environment } = res.locals;
    const orchestrator = getOrchestrator();
    const updated =
        body.data.state === 'enabled'
            ? await functionLifecycle.enable({ environmentId: environment.id, uuid: params.data.uuid, orchestrator })
            : await functionLifecycle.disable({ environmentId: environment.id, uuid: params.data.uuid, orchestrator });
    if (updated.isErr()) {
        tracer.scope().active()?.setTag('error', updated.error);
        res.status(500).send({ error: { code: 'server_error', message: `Failed to ${body.data.state === 'enabled' ? 'enable' : 'disable'} function` } });
        return;
    }
    if (!updated.value) {
        res.status(404).send({ error: { code: 'not_found', message: `Function '${params.data.uuid}' was not found` } });
        return;
    }

    res.status(200).send(toGetFunctionResponse(updated.value));
});
