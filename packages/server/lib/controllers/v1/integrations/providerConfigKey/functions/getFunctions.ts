import { configService, getSyncConfigsAsStandardConfig } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { toNangoFunctionDeployed } from '../../../../../formatters/function.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';
import { validationParams } from '../getIntegration.js';

import type { GetIntegrationFunctions } from '@nangohq/types';

export const getIntegrationFunctions = asyncWrapper<GetIntegrationFunctions>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { environment } = res.locals;
    const { providerConfigKey } = valParams.data;

    const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: 'Integration does not exist' } });
        return;
    }

    const deployed = await getSyncConfigsAsStandardConfig(environment.id, providerConfigKey);
    const data = [...(deployed?.actions ?? []), ...(deployed?.syncs ?? [])].map(toNangoFunctionDeployed);

    res.status(200).send({ data });
});
