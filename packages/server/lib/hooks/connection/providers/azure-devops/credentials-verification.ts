import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    console.error('Running verification');
    const {
        credentials,
        connection_config: { organizationUrl },
        provider_config_key
    } = nango.getConnection();

    const { username, password } = credentials as { username: string; password: string };
    console.log('Running verification');

    const response = await nango.proxy({
        method: 'GET',
        endpoint: '/_apis/projects',
        baseUrlOverride: organizationUrl,
        providerConfigKey: provider_config_key,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${username}:${password}`
        }
    });

    console.log(response);

    if (response.status !== 200) {
        throw new Error('Incorrect Credentials');
    }
}
