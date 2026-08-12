import type { InternalNango as Nango } from '../../credentials-verification-script.js';

interface IFaxVerificationResponse {
    code?: number;
    message?: string;
}

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();
    const response = await nango.proxy<IFaxVerificationResponse>({
        method: 'POST',
        endpoint: '/customer/fax-lists',
        providerConfigKey: provider_config_key,
        data: {}
    });

    if ('data' in response && hasInvalidAccessToken(response.data)) {
        throw new Error('Incorrect Credentials');
    }
}

export function hasInvalidAccessToken(response: unknown): boolean {
    if (typeof response !== 'object' || response === null) {
        return false;
    }

    if ('code' in response && response.code === 12001) {
        return true;
    }

    return 'message' in response && typeof response.message === 'string' && response.message.toLowerCase().replaceAll(/\s/g, '') === 'accesstokeninvalid';
}
