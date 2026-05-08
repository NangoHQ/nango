export class DuplicateTaskNameError extends Error {
    constructor() {
        super('Task with this name already exists');
        this.name = 'DuplicateTaskNameError';
    }
}

export function isDuplicateTaskNameError(err: unknown): boolean {
    return err instanceof DuplicateTaskNameError;
}
