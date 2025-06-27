import type { Task } from '../types.js';

export function stringifyTask(task: Task): string {
    // remove payload and output from the stringified task
    // to avoid logging sensitive data and/or large data
    return JSON.stringify({ ...task, payload: 'REDACTED', output: 'REDACTED' });
}
