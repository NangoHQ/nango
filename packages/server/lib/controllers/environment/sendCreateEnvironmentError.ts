import { PROD_ENVIRONMENT_NAME } from '@nangohq/shared';

import type { CreateEnvironmentError } from '@nangohq/shared';
import type { Response } from 'express';

export function sendCreateEnvironmentError(res: Response, error: CreateEnvironmentError): void {
    switch (error.code) {
        case 'invalid_is_prod_flag':
            res.status(400).send({
                error: { code: error.code, message: `The "${PROD_ENVIRONMENT_NAME}" environment must be marked as production.` }
            });
            return;
        case 'conflict':
            res.status(409).send({ error: { code: error.code, message: 'Environment already exists' } });
            return;
        case 'resource_capped':
            res.status(400).send({ error: { code: error.code, message: 'Maximum number of environments reached' } });
            return;
        case 'creation_failed':
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to create environment' } });
            return;
        default:
            ((exhaustiveCheck: never) => {
                throw new Error(`Unhandled create environment error code: ${exhaustiveCheck}`);
            })(error.code);
    }
}
