import { describe, expect, it } from 'vitest';

import { nangoPropsSchema } from './schemas.js';

const syncConfigSchema = nangoPropsSchema.shape.syncConfig;

const syncConfig = {
    id: 1,
    sync_name: 'list-warehouses',
    nango_config_id: 1,
    file_location: 'file_location',
    version: '0.0.1',
    models: [],
    active: true,
    runs: null,
    environment_id: 1,
    track_deletes: false,
    type: 'action',
    auto_start: false,
    attributes: {},
    source: 'repo',
    metadata: {},
    input: null,
    sync_type: null,
    webhook_subscriptions: null,
    enabled: true,
    sdk_version: null,
    created_at: '2026-10-28T00:00:00.000Z',
    updated_at: '2026-10-28T00:00:00.000Z'
};

describe('nangoPropsSchema syncConfig', () => {
    it('should default models_json_schema to null when it is missing', () => {
        const result = syncConfigSchema.safeParse(syncConfig);

        expect(result.success).toBe(true);
        expect(result.data?.models_json_schema).toBeNull();
    });

    it('should keep a models_json_schema value', () => {
        const modelsJsonSchema = { definitions: { Input: { type: 'object' } } };
        const result = syncConfigSchema.safeParse({ ...syncConfig, models_json_schema: modelsJsonSchema });

        expect(result.data?.models_json_schema).toStrictEqual(modelsJsonSchema);
    });

    it('should accept a null models_json_schema', () => {
        const result = syncConfigSchema.safeParse({ ...syncConfig, models_json_schema: null });

        expect(result.data?.models_json_schema).toBeNull();
    });
});
