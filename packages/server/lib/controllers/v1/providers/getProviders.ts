import { getProviders, sharedCredentialsService } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { providerListItemToAPI } from '../../../formatters/provider.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetProviders } from '@nangohq/types';

export const getProvidersList = asyncWrapper<GetProviders>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const providers = getProviders();
    if (!providers) {
        res.status(500).send({ error: { code: 'server_error' } });
        return;
    }

    try {
        const sharedCredentials = await sharedCredentialsService.getPreConfiguredProviderScopes();

        const list = Object.entries(providers).map(([provider, properties]) => {
            // check if provider has nango's preconfigured credentials
            const preConfiguredInfo = sharedCredentials.isOk() ? sharedCredentials.value[provider] : undefined;
            const isPreConfigured = preConfiguredInfo ? preConfiguredInfo.preConfigured : false;
            const preConfiguredScopes = preConfiguredInfo ? preConfiguredInfo.scopes : [];

            return providerListItemToAPI(provider, properties, isPreConfigured, preConfiguredScopes);
        });
        const sortedList = list.sort((a, b) => a.name.localeCompare(b.name));
        res.status(200).send({ data: sortedList });
    } catch (err) {
        report(err);
        res.status(500).send({ error: { code: 'server_error' } });
    }
});
