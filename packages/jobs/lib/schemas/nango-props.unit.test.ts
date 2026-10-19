import { describe, expect, it } from 'vitest';

import { nangoPropsSchema } from './nango-props.js';

function props(credentials: { secretKey?: string; taskAuthToken?: string }) {
    return {
        scriptType: 'sync',
        connectionId: 'conn-1',
        nangoConnectionId: 1,
        environmentId: 1,
        environmentName: 'dev',
        providerConfigKey: 'google',
        provider: 'google',
        team: { id: 1, name: 'team' },
        syncConfig: {
            id: 1,
            sync_name: 'contacts',
            type: 'sync',
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
            models_json_schema: null,
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
        activityLogId: 'a'.repeat(22),
        ...credentials,
        debug: false,
        startedAt: new Date(),
        endUser: null,
        runnerFlags: {},
        logger: { level: 'info' }
    };
}

describe('nangoPropsSchema credentials', () => {
    it('accepts a payload with only taskAuthToken', () => {
        expect(nangoPropsSchema.safeParse(props({ taskAuthToken: 'task-jwt' })).success).toBe(true);
    });

    it('rejects a payload with neither secretKey nor taskAuthToken', () => {
        const parsed = nangoPropsSchema.safeParse(props({}));
        expect(parsed.success).toBe(false);
    });
});
