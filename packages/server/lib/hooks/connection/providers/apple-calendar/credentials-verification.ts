import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    const response = await nango.proxy<string>({
        method: 'PROPFIND',
        endpoint: '/',
        providerConfigKey: provider_config_key,
        headers: {
            depth: '0',
            'content-type': 'application/xml; charset=utf-8'
        },
        data: '<propfind xmlns="DAV:"><prop><current-user-principal/></prop></propfind>'
    });

    const raw = typeof (response as { data?: unknown })?.data === 'string' ? (response as { data: string }).data : '';

    if (response.status !== 207 || !raw.includes('current-user-principal')) {
        throw new Error('Incorrect Credentials');
    }
}
