import { report } from '@nangohq/utils';

import { sendFunctionFailure } from './errors.js';

import type { invokeFunction } from '@nangohq/shared';
import type { Response } from 'express';

export function sendFunctionInvocationResult({ res, result }: { res: Response; result: Awaited<ReturnType<typeof invokeFunction>> }): void {
    if (result.isOk()) {
        if ('statusUrl' in result.value) {
            res.setHeader('X-Nango-Invocation-Id', result.value.id);
            res.status(202).location(result.value.statusUrl).json(result.value);
            return;
        }
        res.status(200).json(result.value.data);
        return;
    }

    switch (result.error.code) {
        case 'connection_not_found':
        case 'function_not_found':
            res.status(404).send({ error: { code: result.error.code, message: result.error.message } });
            return;
        case 'function_disabled':
            res.status(403).send({ error: { code: result.error.code, message: result.error.message } });
            return;
        case 'invalid_invocation':
            res.status(400).send({ error: { code: result.error.code, message: result.error.message } });
            return;
        case 'validation_error':
            res.status(400).send({ error: { code: result.error.code, message: result.error.message, errors: result.error.errors } });
            return;
        case 'function_failed':
            sendFunctionFailure({ res, cause: result.error.cause, message: result.error.message, errorToReport: result.error });
            return;
        case 'server_error':
            report(result.error);
            res.status(500).send({ error: { code: result.error.code, message: result.error.message } });
            return;
        default:
            return ((_exhaustiveCheck: never) => {
                res.status(500).send({ error: { code: 'server_error', message: 'Unknown invocation failure' } });
            })(result.error.code);
    }
}
