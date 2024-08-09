import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { DeleteIntegrationPublic } from '@nangohq/types';
import { configService } from '@nangohq/shared';
import { getOrchestrator } from '../../../utils/utils.js';
import { z } from 'zod';

const orchestrator = getOrchestrator();

export const validationParams = z
    .object({
        providerConfigKey: z
            .string()
            .regex(/[a-zA-Z0-9-]+/)
            .max(255)
    })
    .strict();

export const deleteIntegrationPublic = asyncWrapper<DeleteIntegrationPublic>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
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
    const params: DeleteIntegrationPublic['Params'] = valParams.data;

    const integration = await configService.getProviderConfig(params.providerConfigKey, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: 'Integration does not exist' } });
        return;
    }

    const deleted = await configService.deleteProviderConfig({
        id: integration.id!,
        providerConfigKey: integration.unique_key,
        environmentId: environment.id,
        orchestrator
    });

    if (deleted) {
        res.status(200).send({ success: true });
    } else {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to delete integration' } });
    }
});
