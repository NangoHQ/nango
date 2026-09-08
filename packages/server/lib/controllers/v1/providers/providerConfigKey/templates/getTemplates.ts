import { errorManager } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { providerTemplatesToApi } from '../../../../../formatters/provider.js';
import providerService from '../../../../../services/provider.service.js';
import { asyncWrapper } from '../../../../../utils/asyncWrapper.js';
import { validationParams } from '../../getProvider.js';

import type { GetProviderTemplates } from '@nangohq/types';

export const getProviderTemplates = asyncWrapper<GetProviderTemplates>((req, res) => {
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

    const result = providerService.listTemplates({ providerName: valParams.data.providerConfigKey });
    if (result.isErr()) {
        errorManager.report(result.error.cause instanceof Error ? result.error.cause : result.error);
        res.status(500).send({ error: { code: 'server_error', message: result.error.message } });
        return;
    }

    res.status(200).send({ data: providerTemplatesToApi(result.value) });
});
