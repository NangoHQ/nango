import type { AsanaTask, Task } from '../../models';

export function toTask(task: AsanaTask): Task {
    return {
        id: task.gid,
        url: task.permalink_url,
        status: task.completed ? 'completed' : 'open',
        title: task.name,
        description: task.notes || null,
        due_date: task.due_on ? new Date(task.due_on).toISOString() : null,
        assignee: task.assignee
            ? {
                  id: task.assignee.id,
                  email: task.assignee.email || null,
                  name: task.assignee.name,
                  avatar_url: '',
                  created_at: null,
                  modified_at: null
              }
            : null,
        created_at: task.created_at,
        modified_at: task.modified_at
    };
}
