export const taskTypes = ['action', 'webhook', 'sync', 'post-connection-script'] as const;
export type TaskType = (typeof taskTypes)[number];
