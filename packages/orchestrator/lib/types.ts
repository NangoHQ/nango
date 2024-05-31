export const taskTypes = ['action', 'webhook', 'sync'] as const;
export type TaskType = (typeof taskTypes)[number];
