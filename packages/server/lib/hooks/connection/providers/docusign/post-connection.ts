import { isAxiosError } from 'axios';

import type { InternalNango as Nango } from '../../internal-nango.js';
import type { AccountInfo, UserInfoResponse } from './types.js';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const integration = await nango.getIntegration();

    // The integration ID is user-chosen, so the environment comes from the provider.
    const rootUrl = integration?.provider === 'docusign-sandbox' ? 'account-d.docusign.com' : 'account.docusign.com';

    const response = await nango.proxy<UserInfoResponse>({
        baseUrlOverride: `https://${rootUrl}`,
        endpoint: '/oauth/userinfo',
        providerConfigKey: connection.provider_config_key
    });

    if (isAxiosError(response)) {
        return;
    }

    if (response.data.accounts.length <= 0) {
        return;
    }

    const defaultAccount = response.data.accounts.find((account: AccountInfo) => account.is_default);

    if (!defaultAccount) {
        return;
    }

    await nango.updateConnectionConfig({
        baseUri: defaultAccount.base_uri,
        accountId: defaultAccount.account_id
    });
}
