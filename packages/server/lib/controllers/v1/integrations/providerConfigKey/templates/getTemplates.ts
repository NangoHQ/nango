import { configService, functionLookupService } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { toNangoFunction } from '../../../../../formatters/function.js';
import flowService from '../../../../../services/flow.service.js';
import { asyncWrapperWithEnvironment } from '../../../../../utils/asyncWrapper.js';
import { validationParams } from '../getIntegration.js';

import type { GetIntegrationTemplates } from '@nangohq/types';

export const getIntegrationTemplates = asyncWrapperWithEnvironment<GetIntegrationTemplates>(async (req, res) => {
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

    const all = flowService.getAllAvailableFlowsAsStandardConfig();
    const entry = all.find((value) => value.providerConfigKey === integration.provider);

    const templates = entry ? [...entry.actions, ...entry.syncs].flatMap((config) => toNangoFunction(config) ?? []) : [];
    const result = await functionLookupService.listTemplates({ environmentId: environment.id, providerConfigKey, templates });
    if (result.isErr()) {
        report(result.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to list templates' } });
        return;
    }

    res.status(200).send({ data: result.value });
});
