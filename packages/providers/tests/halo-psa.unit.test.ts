import { describe, expect, it } from 'vitest';

import { getProviderScopes, loadProvidersYaml } from '../lib/index.js';

describe('Halo PSA provider', () => {
    it('prefills the OAuth scopes required for usable client credentials', () => {
        expect(loadProvidersYaml()?.['halo-psa']).toMatchObject({
            connection_config: {
                oauth_scopes: {
                    default_value: 'all,all:teams'
                }
            }
        });
        expect(getProviderScopes()?.['halo-psa']).toEqual(['all', 'all:teams']);
    });
});
