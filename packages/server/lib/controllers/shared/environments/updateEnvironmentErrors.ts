import tracer from 'dd-trace';

import { PROD_ENVIRONMENT_NAME } from '@nangohq/shared';

import type { RequestLocals } from '../../../utils/express.js';
import type { UpdateEnvironmentError } from '@nangohq/shared';
import type { PatchPublicEnvironment } from '@nangohq/types';
import type { Response } from 'express';

export function sendUpdateEnvironmentError<TSuccess>(
    res: Response<PatchPublicEnvironment['Errors'] | TSuccess, RequestLocals>,
    error: UpdateEnvironmentError
): void {
    const code = error.code;
    switch (code) {
        case 'not_found':
            res.status(404).send({ error: { code, message: 'Environment not found' } });
            return;
        case 'conflict':
            res.status(409).send({ error: { code, message: 'An environment with this name already exists' } });
            return;
        case 'cannot_change_prod_environment_name':
            res.status(400).send({ error: { code, message: `Cannot change the name of the ${PROD_ENVIRONMENT_NAME} environment` } });
            return;
        case 'cannot_toggle_prod_environment':
            res.status(400).send({ error: { code, message: `Cannot change the production flag on the ${PROD_ENVIRONMENT_NAME} environment` } });
            return;
        case 'update_failed':
            tracer
                .scope()
                .active()
                ?.setTag('error', error.cause ?? error);
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to update environment configuration' } });
            return;
        default:
            ((exhaustiveCheck: never) => {
                throw new Error(`Unhandled update environment error code: ${exhaustiveCheck}`);
            })(code);
    }
}
