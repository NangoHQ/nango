import { describe, expect, it } from 'vitest';

import { nangoPropsSchema } from './nango-props.js';

const base = {
    scriptType: 'action',
    connectionId: 'conn',
    nangoConnectionId: 1,
    environmentId: 1,
    environmentName: 'dev',
    providerConfigKey: 'google',
    provider: 'google',
    team: { id: 1, name: 'team' },
    syncConfig: {
        id: 1,
        sync_name: 'action',
        type: 'action',
        environment_id: 1,
        models: [],
        file_location: '/tmp',
        nango_config_id: 1,
        active: true,
        runs: null,
        track_deletes: false,
        auto_start: false,
        enabled: true,
        webhook_subscriptions: [],
        model_schema: null,
        models_json_schema: {},
        created_at: new Date(),
        updated_at: new Date(),
        version: '1',
        attributes: {},
        source: 'repo',
        input: null,
        sync_type: null,
        metadata: {},
        sdk_version: null,
        features: []
    },
    activityLogId: 'aaaaaaaaaaaaaaaaaaaa',
    debug: false,
    startedAt: new Date(),
    endUser: null,
    runnerFlags: {}
};

describe('nangoPropsSchema', () => {
    it('accepts a secret, a task token, or both, and rejects a payload with neither', () => {
        expect(nangoPropsSchema.safeParse({ ...base, secretKey: 'sk' }).success).toBe(true);
        expect(nangoPropsSchema.safeParse({ ...base, taskAuthToken: 'tok' }).success).toBe(true);
        expect(nangoPropsSchema.safeParse({ ...base, secretKey: 'sk', taskAuthToken: 'tok' }).success).toBe(true);
        expect(nangoPropsSchema.safeParse(base).success).toBe(false);
    });
});
