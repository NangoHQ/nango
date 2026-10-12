import tracer from 'dd-trace';
import { z } from 'zod';

import { functionLifecycle } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../../../../../env.js';
import { connectionIdSchema, variantSchema } from '../../../../../../helpers/validation.js';
import { asyncWrapperWithEnvironment } from '../../../../../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../../../../../utils/utils.js';

import type { PostFunctionVariant } from '@nangohq/types';

const paramsValidation = z.object({ connectionId: connectionIdSchema, functionUuid: z.uuid().transform((uuid) => uuid.toLowerCase()) }).strict();
const bodyValidation = z.object({ variant: variantSchema }).strict();

export const postFunctionVariant = asyncWrapperWithEnvironment<PostFunctionVariant>(async (req, res) => {
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
    const body = bodyValidation.safeParse(req.body);
    if (!body.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(body.error) } });
        return;
    }
    const result = await functionLifecycle.createVariant({
        ...params.data,
        variant: body.data.variant,
        environmentId: res.locals.environment.id,
        maxVariants: res.locals.plan?.variants_per_sync_max ?? envs.MAX_SYNCS_PER_CONNECTION,
        orchestrator: getOrchestrator()
    });
    if (result.isErr()) {
        tracer.scope().active()?.setTag('error', result.error);
        res.status(result.error.status).send({ error: { code: result.error.code, message: result.error.message } });
        return;
    }
    res.status(200).send(result.value);
});
