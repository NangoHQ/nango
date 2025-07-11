import { getProviders } from '@nangohq/shared';

import type { RequestLocals } from '../utils/express.js';
import type { Request, Response } from 'express';

class ConfigController {
    listProvidersFromYaml(_: Request, res: Response<any, Required<RequestLocals>>) {
        const providers = getProviders();
        if (!providers) {
            res.status(500).send({ error: { code: 'server_error' } });
            return;
        }
        const list = Object.entries(providers)
            .map((providerProperties) => {
                const [provider, properties] = providerProperties;
                return {
                    name: provider,
                    displayName: properties.display_name,
                    defaultScopes: properties.default_scopes,
                    authMode: properties.auth_mode,
                    categories: properties.categories,
                    docs: properties.docs
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
        res.status(200).send(list);
    }
}

export default new ConfigController();
