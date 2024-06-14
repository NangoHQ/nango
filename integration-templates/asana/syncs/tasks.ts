import type { NangoSync, BaseAsanaModel, AsanaTask, Task } from '../../models';
// eslint-disable-next-line import/extensions
import { toUser } from '../mappers/to-user';
// eslint-disable-next-line import/extensions
import { toTask } from '../mappers/to-task';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const lastSyncDate = nango.lastSyncDate;

    for await (const workspaces of nango.paginate<BaseAsanaModel>({ endpoint: '/api/1.0/workspaces', params: { limit: 100 }, retries: 10 })) {
        for (const workspace of workspaces) {
            for await (const projects of nango.paginate<BaseAsanaModel>({
                endpoint: '/api/1.0/projects',
                params: { workspace: workspace.gid, limit: 100 },
                retries: 10
            })) {
                for (const project of projects) {
                    const params: Record<string, string> = {
                        project: project.gid,
                        limit: '100',
                        opt_fields: [
                            'name',
                            'resource_type',
                            'completed',
                            'due_on',
                            'permalink_url',
                            'name',
                            'notes',
                            'created_at',
                            'modified_at',
                            'assignee.name',
                            'assignee.email',
                            'assignee.photo'
                        ].join(',')
                    };

                    if (lastSyncDate) {
                        params['modified_since'] = lastSyncDate.toISOString();
                    }
                    for await (const tasks of nango.paginate<AsanaTask>({ endpoint: '/api/1.0/tasks', params, retries: 10 })) {
                        const normalizedTasks = tasks.map((task) => {
                            return {
                                ...toTask(task),
                                assignee: task.assignee ? toUser(task.assignee) : null
                            };
                        });
                        await nango.batchSave<Task>(normalizedTasks, 'Task');
                    }
                }
            }
        }
    }
}
