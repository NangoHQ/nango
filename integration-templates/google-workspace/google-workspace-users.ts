import { GoogleWorkspaceUser, GoogleWorkspaceUserToken, NangoSync } from './models';

export default async function fetchData(nango: NangoSync): Promise<void> {
    // Get the users in the org
    const params = {
        customer: 'my_customer'
    };
    const users = await paginate(nango, '/admin/directory/v1/users', 'users', params);

    let mappedUsers: GoogleWorkspaceUser[] = [];
    for (let user of users) {
        mappedUsers.push({
            id: user.id,
            name: user.name.fullName,
            email: user.primaryEmail,
            suspended: user.suspended,
            archived: user.archived,
            last_login_time: user.lastLoginTime,
            customer_id: user.customer_id,
            thumbnail_url: user.thumbnailPhotoUrl,
            two_fa_enabled: user.isEnrolledIn2Sv,
            org_unit_path: user.orgUnitPath
        });

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

        if (mappedUsers.length > 49) {
            await nango.batchSave(mappedUsers, 'GoogleWorkspaceUser');
            mappedUsers = [];
        }
    }

    await nango.batchSave(mappedUsers, 'GoogleWorkspaceUser');
}

async function paginate(nango: NangoSync, endpoint: string, resultsKey: string, queryParams?: Record<string, string | string[]>) {
    const MAX_PAGE = 100;
    let results: any[] = [];
    let page = null;
    let callParams = queryParams || {};
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
