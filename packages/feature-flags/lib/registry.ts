export const FLAGS = {} as const;

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];
