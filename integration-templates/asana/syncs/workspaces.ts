import type { NangoSync, AsanaWorkspace } from '../../models';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const params: Record<string, string> = {
        limit: '100',
        opt_fields: ['gid', 'name', 'resource_type', 'is_organization'].join(',')
    };

    for await (const workspaces of nango.paginate<AsanaWorkspace>({ endpoint: '/api/1.0/workspaces', params, retries: 10 })) {
        const workspacesWithId = workspaces.map((workspace) => {
            return {
                ...workspace,
                id: workspace.gid
            };
        });
        await nango.batchSave<AsanaWorkspace>(workspacesWithId, 'AsanaWorkspace');
    }
}
