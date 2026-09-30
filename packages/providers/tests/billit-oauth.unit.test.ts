import { assert, describe, expect, it } from 'vitest';

import { loadProvidersYaml } from '../lib/index.js';

describe('Billit OAuth', () => {
    it('retains default PKCE without overriding the session challenge or verifier', () => {
        const provider = loadProvidersYaml()?.['billit-oauth'];
        assert(provider?.auth_mode === 'OAUTH2', 'Billit OAuth provider must load');

        expect(provider.disable_pkce ?? false).toBe(false);
        expect(provider.authorization_params).not.toHaveProperty('code_challenge');
        expect(provider.authorization_params).not.toHaveProperty('code_challenge_method');
        expect(provider.token_params).not.toHaveProperty('code_verifier');
    });
});
