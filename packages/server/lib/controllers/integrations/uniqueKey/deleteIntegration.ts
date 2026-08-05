import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import integrationService from '../../../services/integration.service.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { validationParams } from './getIntegration.js';

import type { DeleteIntegrationsServiceError } from '../../../services/integration.service.js';
import type { DeletePublicIntegration } from '@nangohq/types';
import type { Response } from 'express';

export const deletePublicIntegration = asyncWrapper<DeletePublicIntegration>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) }
        });
        return;
    }

    const { environment } = res.locals;
    const params: DeletePublicIntegration['Params'] = valParams.data;

    const result = await integrationService.delete({ environmentId: environment.id, integrationId: params.uniqueKey });
    if (result.isErr()) {
        sendDeleteIntegrationError(res, result.error);
        return;
    }

    res.status(200).send({ success: true });
});

function sendDeleteIntegrationError(res: Response, error: DeleteIntegrationsServiceError): void {
    const code = error.code;
    switch (code) {
        case 'not_found':
            res.status(404).send({ error: { code: 'not_found', message: 'Integration does not exist' } });
            return;
        case 'delete_failed':
            res.status(500).send({ error: { code: 'server_error', message: error.message } });
            return;
        default: {
            const exhaustiveCheck: never = code;
            void exhaustiveCheck;
            return;
        }
    }
}
