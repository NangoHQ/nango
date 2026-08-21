export const taskTypes = ['action', 'webhook', 'sync', 'on-event', 'abort', 'function'] as const;
export type TaskType = (typeof taskTypes)[number];
