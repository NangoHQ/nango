import type { ApolloAuthenticationResponse } from './types.js';
import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();
    const response = await nango.proxy<ApolloAuthenticationResponse>({
        endpoint: '/v1/auth/health',
        providerConfigKey: provider_config_key
    });

    if ('data' in response && !response.data.is_logged_in) {
        throw new Error('Incorrect Credentials');
    }
}
