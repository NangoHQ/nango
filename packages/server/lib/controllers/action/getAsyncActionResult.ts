import { z } from 'zod';

import { errorManager } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { GetAsyncActionResult } from '@nangohq/types';

const orchestrator = getOrchestrator();

const paramValidation = z
    .object({
        id: z.string().uuid()
    })
    .strict();

export const getAsyncActionResult = asyncWrapper<GetAsyncActionResult>(async (req, res) => {
    const paramValue = paramValidation.safeParse(req.params);
    if (!paramValue.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramValue.error) } });
        return;
    }

    const { environment } = res.locals;
    const retryKey = paramValue.data.id;
    const result = await orchestrator.getActionOutput({ retryKey, environmentId: environment.id });

    if (result.isErr()) {
        errorManager.errResFromNangoErr(res, result.error);
        return;
    }

    if (result.value === null) {
        res.status(404).json({ error: { code: 'not_found', message: `No action '${retryKey}' found` } });
        return;
    }

    res.status(200).json(result.value as GetAsyncActionResult['Success']);
});
