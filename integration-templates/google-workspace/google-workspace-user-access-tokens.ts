import type { GoogleWorkspaceUserToken, NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    // Get the users in the org
    const params = {
        customer: 'my_customer'
    };
    const users = await paginate(nango, '/admin/directory/v1/users', 'users', params);

    for (const user of users) {
        // Get the access tokens
        const tokens = await paginate(nango, `/admin/directory/v1/users/${user.id}/tokens`, 'items');
        const mappedTokens: GoogleWorkspaceUserToken[] = tokens.map((token) => ({
            id: token.clientId,
            user_id: user.id,
            app_name: token.displayText,
            anonymous_app: token.anonymous,
            scopes: token.scopes.join(',')
        }));

        await nango.batchSave(mappedTokens, 'GoogleWorkspaceUserToken');
    }
}

async function paginate(nango: NangoSync, endpoint: string, resultsKey: string, queryParams?: Record<string, string | string[]>) {
    const MAX_PAGE = 100;
    let results: any[] = [];
    let page = null;
    const callParams = queryParams || {};
    while (true) {
        if (page) {
            callParams['pageToken'] = `${page}`;
        }

        const resp = await nango.get({
            baseUrlOverride: 'https://admin.googleapis.com',
            endpoint: endpoint,
            params: {
                maxResults: `${MAX_PAGE}`,
                ...callParams
            }
        });

        results = results.concat(resp.data[resultsKey]);

        if (resp.data.nextPageToken) {
            page = resp.data.nextPageToken;
        } else {
            break;
        }
    }

    return results;
}
