import * as z from 'zod';

import { errorManager } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { GetAsyncActionResult } from '@nangohq/types';

const orchestrator = getOrchestrator();

const paramValidation = z
    .object({
        id: z.string().uuid()
    })
    .strict();

export const getAsyncActionResult = asyncWrapperWithEnvironment<GetAsyncActionResult>(async (req, res) => {
    const paramValue = paramValidation.safeParse(req.params);
    if (!paramValue.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramValue.error) } });
        return;
    }

    const { environment } = res.locals;
    const retryKey = paramValue.data.id;
    const result = await orchestrator.getOutput({ retryKey, environmentId: environment.id, errorType: 'action_script_failure' });

    if (result.isErr()) {
        errorManager.errResFromNangoErr(res, result.error);
        return;
    }

    // Legacy behavior: 404 while the action is still running
    if (result.value.state !== 'done' || result.value.output === null) {
        res.status(404).json({ error: { code: 'not_found', message: `No action '${retryKey}' found` } });
        return;
    }

    res.status(200).json(result.value.output as GetAsyncActionResult['Success']);
});
