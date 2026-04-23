export class DuplicateTaskNameError extends Error {
    readonly taskName: string | undefined;

    constructor({ taskName }: { taskName?: string } = {}) {
        super(taskName ? `Task with name '${taskName}' already exists` : 'Task with this name already exists');
        this.name = 'DuplicateTaskNameError';
        this.taskName = taskName;
    }
}

export function isDuplicateTaskNameError(err: unknown): err is DuplicateTaskNameError {
    return err instanceof DuplicateTaskNameError;
}
