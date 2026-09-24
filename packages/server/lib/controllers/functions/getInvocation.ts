import * as z from 'zod';

import { zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';
import { sendFunctionFailure } from './errors.js';

import type { GetFunctionInvocation } from '@nangohq/types';

const orchestrator = getOrchestrator();

const paramValidation = z
    .object({
        id: z.uuid()
    })
    .strict();

export const getFunctionInvocation = asyncWrapperWithEnvironment<GetFunctionInvocation>(async (req, res) => {
    const paramValue = paramValidation.safeParse(req.params);
    if (!paramValue.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramValue.error) } });
        return;
    }

    const { environment } = res.locals;
    const retryKey = paramValue.data.id;
    const result = await orchestrator.getOutput({ retryKey, environmentId: environment.id, errorType: 'function_execution_failure' });

    if (result.isErr()) {
        sendFunctionFailure({ res, cause: result.error, message: result.error.message, errorToReport: result.error });
        return;
    }

    switch (result.value.state) {
        case 'not_found':
            res.status(404).json({ error: { code: 'not_found', message: `No invocation '${retryKey}' found` } });
            return;
        case 'in_progress':
            res.status(202).json({ id: retryKey, statusUrl: `/functions/invocations/${retryKey}` });
            return;
        case 'done':
            res.status(200).json(result.value.output);
            return;
    }
});
