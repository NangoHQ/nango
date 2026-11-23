import * as z from 'zod';

import { functionLookupService, resolveFunctionConnection } from '@nangohq/shared';
import { report, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema } from '../../../../../../../helpers/validation.js';
import { asyncWrapperWithEnvironment } from '../../../../../../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../../../../../../utils/utils.js';
import { sendFunctionFailure } from '../../../../../../functions/errors.js';

import type { GetFunctionInvocation } from '@nangohq/types';

const orchestrator = getOrchestrator();

const paramValidation = z
    .object({
        connectionId: connectionIdSchema,
        functionUuid: z.uuid(),
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
    const { connectionId, functionUuid } = paramValue.data;
    const functions = await functionLookupService.resolveFunctionByUuid({ environmentId: environment.id, functionUuid });
    if (functions.isErr()) {
        report(functions.error);
        res.status(500).json({ error: { code: 'server_error', message: 'Failed to find function' } });
        return;
    }
    const func = functions.value;
    if (!func) {
        res.status(404).json({ error: { code: 'function_not_found', message: `Function '${functionUuid}' was not found` } });
        return;
    }
    const connection = await resolveFunctionConnection({ fn: func, connectionId, environmentId: environment.id });
    if (connection.isErr()) {
        if (connection.error.code === 'server_error') {
            report(connection.error);
            res.status(500).json({ error: { code: 'server_error', message: 'Failed to find connection' } });
        } else if (connection.error.code === 'invalid_invocation') {
            res.status(400).json({ error: { code: 'invalid_invocation', message: connection.error.message } });
        } else {
            res.status(404).json({ error: { code: 'connection_not_found', message: `Connection '${connectionId}' was not found` } });
        }
        return;
    }
    const retryKey = paramValue.data.id;
    // TODO: check the invocation is tied to the connection and function in the path.
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
            res.setHeader('X-Nango-Invocation-Id', retryKey);
            res.status(202).json({ id: retryKey, statusUrl: req.path });
            return;
        case 'done':
            res.setHeader('X-Nango-Invocation-Id', retryKey);
            res.status(200).json(result.value.output);
            return;
    }
});
