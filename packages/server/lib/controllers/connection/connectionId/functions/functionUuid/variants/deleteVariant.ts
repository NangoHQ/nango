import tracer from 'dd-trace';
import { z } from 'zod';

import { functionLifecycle } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, variantSchema } from '../../../../../../helpers/validation.js';
import { asyncWrapperWithEnvironment } from '../../../../../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../../../../../utils/utils.js';

import type { DeleteFunctionVariant } from '@nangohq/types';

const paramsValidation = z
    .object({ connectionId: connectionIdSchema, functionUuid: z.uuid().transform((uuid) => uuid.toLowerCase()), variant: variantSchema })
    .strict();

export const deleteFunctionVariant = asyncWrapperWithEnvironment<DeleteFunctionVariant>(async (req, res) => {
    const query = requireEmptyQuery(req);
    if (query) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(query.error) } });
        return;
    }
    const params = paramsValidation.safeParse(req.params);
    if (!params.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(params.error) } });
        return;
    }
    const result = await functionLifecycle.deleteVariant({
        ...params.data,
        environmentId: res.locals.environment.id,
        orchestrator: getOrchestrator()
    });
    if (result.isErr()) {
        tracer.scope().active()?.setTag('error', result.error);
        res.status(result.error.status).send({ error: { code: result.error.code, message: result.error.message } });
        return;
    }
    res.status(200).send({ success: true });
});
