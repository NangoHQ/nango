export const taskTypes = ['action', 'webhook', 'sync', 'post-connection-script', 'abort'] as const;
export type TaskType = (typeof taskTypes)[number];
