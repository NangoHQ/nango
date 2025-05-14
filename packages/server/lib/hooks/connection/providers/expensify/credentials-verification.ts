import type { InternalNango as Nango } from '../../credentials-verification-script.js';
import type { PolicyListResponse } from './types.js';

export default async function execute(nango: Nango) {
    const { credentials, provider_config_key } = nango.getConnection();

    const { username, password } = credentials as { username: string; password: string };
    const postData =
        'requestJobDescription=' +
        encodeURIComponent(
            JSON.stringify({
                type: 'get',
                credentials: {
                    partnerUserID: username,
                    partnerUserSecret: password
                },
                inputSettings: {
                    type: 'policyList'
                }
            })
        );

    const response = await nango.proxy<PolicyListResponse>({
        method: 'POST',
        // https://integrations.expensify.com/Integration-Server/doc/#policy-list-getter
        endpoint: '/ExpensifyIntegrations',
        providerConfigKey: provider_config_key,
        data: postData,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    if (isAuthorizationError(response)) {
        throw new Error('Incorrect Credentials');
    }
}

function isAuthorizationError(response: unknown): boolean {
    return (
        typeof response === 'object' &&
        response !== null &&
        'data' in response &&
        typeof response.data === 'object' &&
        response.data !== null &&
        'responseMessage' in response.data &&
        typeof response.data.responseMessage === 'string' &&
        response.data.responseMessage.includes('Authentication error')
    );
}
