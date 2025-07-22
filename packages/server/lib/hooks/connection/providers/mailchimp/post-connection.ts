import axios from 'axios';

import type { MailchimpUser } from './types.js';
import type { InternalNango as Nango } from '../../internal-nango.js';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    const response = await nango.proxy<MailchimpUser>({
        method: 'GET',
        baseUrlOverride: `https://login.mailchimp.com`,
        // https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2/#implement-the-oauth-2-workflow-on-your-server
        endpoint: `/oauth2/metadata`,
        providerConfigKey: connection.provider_config_key
    });

    if (!response || axios.isAxiosError(response) || !response.data) {
        return;
    }

    const { dc } = response.data;
    await nango.updateConnectionConfig({ dc });
}
