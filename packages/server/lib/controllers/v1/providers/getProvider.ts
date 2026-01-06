import * as z from 'zod';

import { getProvider, sharedCredentialsService } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { providerListItemToAPI } from '../../../formatters/provider.js';
import { providerNameSchema } from '../../../helpers/validation.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetProvider } from '@nangohq/types';

export const validationParams = z
    .object({
        providerConfigKey: providerNameSchema
    })
    .strict();

export const getProviderItem = asyncWrapper<GetProvider>(async (req, res) => {
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

    const params: GetProvider['Params'] = valParams.data;
    const provider = getProvider(params.providerConfigKey);
    if (!provider) {
        res.status(404).send({ error: { code: 'not_found', message: `Unknown provider ${params.providerConfigKey}` } });
        return;
    }

    try {
        const sharedCredentials = await sharedCredentialsService.getPreConfiguredProviderScopes();
        const preConfiguredInfo = sharedCredentials.isOk() ? sharedCredentials.value[params.providerConfigKey] : undefined;
        const isPreConfigured = preConfiguredInfo ? preConfiguredInfo.preConfigured : false;
        const preConfiguredScopes = preConfiguredInfo ? preConfiguredInfo.scopes : [];

        const providerListItem = providerListItemToAPI(params.providerConfigKey, provider, isPreConfigured, preConfiguredScopes);
        res.status(200).send({ data: providerListItem });
    } catch (err) {
        report(err);
        res.status(500).send({ error: { code: 'server_error' } });
    }
});
