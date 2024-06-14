import type { NangoSync, AsanaWorkspace, AsanaUser, User } from '../../models';
import { toUser } from '../mappers/to-user.js';

export default async function fetchData(nango: NangoSync): Promise<void> {
    for await (const workspaces of nango.paginate<AsanaWorkspace>({
        endpoint: '/api/1.0/workspaces',
        params: {
            limit: 100,
            // NOTE: if we sync organizations and workspaces it is possible we get
            // duplicate users
            opt_fields: ['is_organization', 'name'].join(',')
        },
        retries: 10
    })) {
        for (const workspace of workspaces) {
            // can't do a lookup of the protected "Personal Projects" workspace
            if (workspace.name !== 'Personal Projects') {
                const params: Record<string, string> = {
                    workspace: workspace.gid,
                    limit: '100',
                    opt_fields: ['gid', 'name', 'email', 'photo', 'resource_type'].join(',')
                };
                for await (const users of nango.paginate<AsanaUser>({ endpoint: '/api/1.0/users', params, retries: 10 })) {
                    const normalizedUsers = users.map((user) => toUser(user));

                    await nango.batchSave<User>(normalizedUsers, 'User');
                }
            }
        }
    }
}
