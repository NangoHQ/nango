export const taskTypes = ['action', 'webhook', 'sync', 'on-event', 'abort'] as const;
export type TaskType = (typeof taskTypes)[number];
