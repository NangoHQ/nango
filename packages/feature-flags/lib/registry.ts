export const FLAGS = {
    // TODO(NAN-5344): temporary, only used to test feature flags end-to-end
    TestFlag: 'test-flag'
} as const;

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];
