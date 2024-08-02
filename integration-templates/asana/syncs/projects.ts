import type { NangoSync, BaseAsanaModel, AsanaProject } from '../../models';

export default async function fetchData(nango: NangoSync): Promise<void> {
    for await (const workspaces of nango.paginate<BaseAsanaModel>({ endpoint: '/api/1.0/workspaces', params: { limit: 100 }, retries: 10 })) {
        for (const workspace of workspaces) {
            for await (const projects of nango.paginate<BaseAsanaModel>({
                endpoint: '/api/1.0/projects',
                params: {
                    workspace: workspace.gid,
                    limit: 100
                },
                retries: 10
            })) {
                const projectsWithId = projects.map((project) => {
                    return {
                        ...project,
                        id: project.gid
                    };
                });
                await nango.batchSave<AsanaProject>(projectsWithId, 'AsanaProject');
            }
        }
    }
}
