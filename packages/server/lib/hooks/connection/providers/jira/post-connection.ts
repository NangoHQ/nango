import axios from 'axios';

import { getLogger } from '@nangohq/utils';

import type { InternalNango as Nango } from '../../internal-nango.js';

const logger = getLogger('post-connection:jira');

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const connectionConfig = connection.connection_config || {};

    const response = await nango.proxy({
        endpoint: `oauth/token/accessible-resources`,
        providerConfigKey: connection.provider_config_key
    });

    if (axios.isAxiosError(response) || !response || !response.data || response.data.length === 0 || !response.data[0].id) {
        return;
    }

    // If baseUrl is provided, find the matching site
    let site = response.data[0]; // Default to first site

    if (connectionConfig['baseUrl']?.length) {
        const providedBaseUrl = connectionConfig['baseUrl'];

        const matchingSite = response.data.find((s: any) => {
            return s.url.includes(providedBaseUrl) || (s.name && s.name === providedBaseUrl) || s.url === providedBaseUrl;
        });

        if (matchingSite) {
            site = matchingSite;
        }
    }

    // Check if the site has Confluence scopes to determine if it's a Confluence site
    const isConfluence = site.scopes?.some((scope: string) => scope.includes('confluence')) || false;

    const endpoint = isConfluence ? `ex/confluence/${site.id}/wiki/rest/api/user/current` : `ex/jira/${site.id}/rest/api/3/myself`;

    let accountId: string | null = null;

    // we are making calls to endpoints that require certain scopes. Wrap these
    // calls in a try/catch to avoid breaking the connection if the scopes are not available.
    try {
        const accountResponse = await nango.proxy({
            // jira: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-myself/#api-rest-api-3-myself-get
            // confluence https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-users/#api-wiki-rest-api-user-current-get
            endpoint,
            providerConfigKey: connection.provider_config_key
        });
        accountId = accountResponse && !axios.isAxiosError(accountResponse) ? accountResponse.data?.accountId : null;
    } catch {
        logger.warning('Failed to fetch account ID from Jira/Confluence API. This may be due to insufficient scopes or permissions.');
    }

    await nango.updateConnectionConfig({
        cloudId: site.id,
        baseUrl: site.url,
        ...(accountId ? { accountId } : {})
    });
}
