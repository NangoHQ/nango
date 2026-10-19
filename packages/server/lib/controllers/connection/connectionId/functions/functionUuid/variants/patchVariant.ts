import tracer from 'dd-trace';
import { z } from 'zod';

import { functionLifecycle } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, frequencySchema, variantSchema } from '../../../../../../helpers/validation.js';
import { asyncWrapperWithEnvironment } from '../../../../../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../../../../../utils/utils.js';

import type { PatchFunctionVariant } from '@nangohq/types';

const paramsValidation = z
    .object({
        connectionId: connectionIdSchema,
        functionUuid: z.uuid().transform((uuid) => uuid.toLowerCase()),
        variant: variantSchema
    })
    .strict();
const bodyValidation = z
    .object({
        enabled: z.boolean().optional(),
        frequency: frequencySchema.nullable().optional()
    })
    .strict()
    .refine((data) => data.enabled !== undefined || data.frequency !== undefined, { message: 'At least one of enabled or frequency is required' });

export const patchFunctionVariant = asyncWrapperWithEnvironment<PatchFunctionVariant>(async (req, res) => {
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
    const result = await functionLifecycle.updateVariant(getOrchestrator(), {
        ...params.data,
        ...body.data,
        environmentId: res.locals.environment.id
    });
    if (result.isErr()) {
        tracer.scope().active()?.setTag('error', result.error);
        res.status(result.error.status).send({ error: { code: result.error.code, message: result.error.message } });
        return;
    }
    res.status(200).send(result.value);
});
