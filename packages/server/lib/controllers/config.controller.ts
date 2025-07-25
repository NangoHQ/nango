import { configService, getProviders } from '@nangohq/shared';

import type { RequestLocals } from '../utils/express.js';
import type { Request, Response } from 'express';

class ConfigController {
    async listProvidersFromYaml(_: Request, res: Response<any, Required<RequestLocals>>) {
        const providers = getProviders();
        if (!providers) {
            res.status(500).send({ error: { code: 'server_error' } });
            return;
        }

        const list = await Promise.all(
            Object.entries(providers).map(async (providerProperties) => {
                const [provider, properties] = providerProperties;
                // check if provider has nango's preconfigured credentials
                const preConfiguredInfo = await configService.getPreConfiguredProviderScopes(provider);
                const isPreConfigured = preConfiguredInfo ? preConfiguredInfo.preConfigured : false;
                const preConfiguredScopes = preConfiguredInfo ? preConfiguredInfo.scopes : [];

                return {
                    name: provider,
                    displayName: properties.display_name,
                    defaultScopes: properties.default_scopes,
                    authMode: properties.auth_mode,
                    categories: properties.categories,
                    docs: properties.docs,
                    preConfigured: isPreConfigured,
                    preConfiguredScopes: preConfiguredScopes
                };
            })
        );
        const sortedList = list.sort((a, b) => a.name.localeCompare(b.name));
        res.status(200).send(sortedList);
    }
}

export default new ConfigController();
