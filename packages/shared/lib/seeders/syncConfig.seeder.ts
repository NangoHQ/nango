import type { NangoSyncConfig } from '@nangohq/types';

export function getTestStdSyncConfig(data?: Partial<NangoSyncConfig>): NangoSyncConfig {
    return {
        name: 'test',
        type: 'sync',
        version: '1.0.0',
        endpoints: [],
        returns: [],
        json_schema: {},
        is_zero_yaml: false,
        sdk_version: '1.0.0',
        ...data
    };
}
