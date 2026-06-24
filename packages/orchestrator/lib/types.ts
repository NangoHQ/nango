export const taskTypes = ['action', 'webhook', 'sync', 'on-event', 'function', 'abort'] as const;
export type TaskType = (typeof taskTypes)[number];
