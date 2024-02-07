import type { AsanaTask, NangoSync } from './models';

export default async function fetchData(nango: NangoSync) {
    // Get the user's workspaces & projects
    // For testing we just get the first project of the first workspace
    const workspaces = await paginate(nango, '/api/1.0/workspaces');
    const workspace = workspaces[0];

    const projects = await paginate(nango, '/api/1.0/projects', { workspace: workspace.gid });
    const project = projects[0];

    // Get all tasks for the project
    const filters = {
        project: project.gid,
        opt_fields: 'name,completed,created_at,modified_at'
    };
    const tasks = await paginate(nango, '/api/1.0/tasks', filters);
    let mappedTasks: AsanaTask[] = [];
    for (const task of tasks) {
        mappedTasks.push({
            id: task.gid,
            project_id: project.gid,
            name: task.name,
            completed: task.completed,
            created_at: task.created_at,
            modified_at: task.modified_at
        });

        if (mappedTasks.length > 49) {
            await nango.batchSave(mappedTasks, 'AsanaTask');
            mappedTasks = [];
        }
    }
    await nango.batchSave(mappedTasks, 'AsanaTask');
}

async function paginate(nango: NangoSync, endpoint: string, queryParams?: Record<string, string | string[]>) {
    const MAX_PAGE = 100;
    let results: any[] = [];
    let page = null;
    const callParams = queryParams || {};
    while (true) {
        if (page) {
            callParams['offset'] = `${page}`;
        }

        const resp = await nango.get({
            endpoint: endpoint,
            params: {
                limit: `${MAX_PAGE}`,
                ...callParams
            }
        });

        results = results.concat(resp.data.data);

        if (resp.data.next_page) {
            page = resp.data.next_page.offset;
        } else {
            break;
        }
    }

    return results;
}
