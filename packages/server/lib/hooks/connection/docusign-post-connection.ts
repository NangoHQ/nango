import type { InternalNango as Nango } from './post-connection.js';
import type { UserInfoResponse, AccountInfo } from '../response-types/docusign.js';
import { isAxiosError } from 'axios';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    const rootUrl = connection.provider_config_key.includes('sandbox') ? 'account-d.docusign.com' : 'account.docusign.com';

    const response = await nango.proxy<UserInfoResponse>({
        baseUrlOverride: `https://${rootUrl}`,
        endpoint: '/oauth/userinfo',
        connectionId: connection.connection_id,
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
