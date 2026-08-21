export class DuplicateTaskNameError extends Error {
    constructor() {
        super('Task with this name already exists');
        this.name = 'DuplicateTaskNameError';
    }
}

export function isDuplicateTaskNameError(err: unknown): boolean {
    return err instanceof DuplicateTaskNameError;
}

export class ScheduleTaskAlreadyRunningError extends Error {
    constructor() {
        super('A task for this schedule is already running');
        this.name = 'ScheduleTaskAlreadyRunningError';
    }
}

export function isScheduleTaskAlreadyRunningError(err: unknown): boolean {
    return err instanceof ScheduleTaskAlreadyRunningError;
}

export class ScheduleLockedError extends Error {
    constructor() {
        super('Schedule is being mutated by another operation');
        this.name = 'ScheduleLockedError';
    }
}

export function isScheduleLockedError(err: unknown): boolean {
    return err instanceof ScheduleLockedError;
}

export function isPgLockNotAvailableError(err: unknown): boolean {
    return !!err && typeof err === 'object' && (err as { code?: string }).code === '55P03';
}
