import { envs } from '../env.js';
import { propsMessages, propsOperations } from '../schema/mappings.js';

import type { estypes } from '@elastic/elasticsearch';

export const policyOperations = {
    name: `${envs.NANGO_LOGS_ES_PREFIX}_policy_retention_operations`,
    policy: {
        phases: {
            hot: { actions: { set_priority: { priority: 100 } }, min_age: '0ms' },
            delete: { min_age: '15d', actions: { delete: {} } }
        }
    }
};

export const policyMessages = {
    name: `${envs.NANGO_LOGS_ES_PREFIX}_policy_retention`,
    policy: {
        phases: {
            hot: { actions: { set_priority: { priority: 100 } }, min_age: '0ms' },
            warm: {
                min_age: envs.NANGO_LOGS_ES_WARM_MIN_AGE,
                actions: {
                    set_priority: { priority: 50 },
                    shrink: { max_primary_shard_size: '8gb' },
                    readonly: {}
                }
            },
            delete: { min_age: '15d', actions: { delete: {} } }
        }
    }
};

function analysisBlock() {
    return {
        analyzer: {
            default: {
                type: 'standard'
            },
            default_search: {
                type: 'standard'
            }
        }
    };
}

function indexSortBlock() {
    return {
        'sort.field': ['createdAt', 'id'],
        'sort.order': ['desc', 'desc']
    };
}

function buildOperationsSettings(): Record<string, unknown> {
    const base: Record<string, unknown> = {
        analysis: analysisBlock(),
        index: indexSortBlock(),
        number_of_shards: envs.NANGO_LOGS_ES_SHARD_PER_DAY_OPERATIONS
    };
    if (envs.NANGO_LOGS_PROVIDER === 'opensearch') {
        base['index.plugins.index_state_management.policy_id'] = policyOperations.name;
    } else {
        base['lifecycle'] = { name: policyOperations.name };
    }
    return base;
}

function buildMessagesSettings(): Record<string, unknown> {
    const base: Record<string, unknown> = {
        analysis: analysisBlock(),
        index: indexSortBlock(),
        number_of_shards: envs.NANGO_LOGS_ES_SHARD_PER_DAY_MESSAGES
    };
    if (envs.NANGO_LOGS_PROVIDER === 'opensearch') {
        base['index.plugins.index_state_management.policy_id'] = policyMessages.name;
    } else {
        base['lifecycle'] = { name: policyMessages.name };
    }
    return base;
}

export function getDailyIndexPipeline(name: string): estypes.IngestPutPipelineRequest {
    return {
        id: `daily.${name}`,
        description: 'Daily index',
        processors: [
            {
                date_index_name: {
                    field: 'createdAt',
                    index_name_prefix: `${name}.`,
                    date_rounding: 'd',
                    date_formats: ["yyyy-MM-dd'T'HH:mm:ss.SSSXX"]
                }
            }
        ]
    };
}

export const indexOperations: estypes.IndicesCreateRequest = {
    index: `20250724_${envs.NANGO_LOGS_ES_INDEX_OPERATIONS ?? 'operations'}`,
    settings: buildOperationsSettings() as NonNullable<estypes.IndicesCreateRequest['settings']>,
    mappings: {
        _source: { enabled: true },
        dynamic: false,
        properties: propsOperations
    }
};

export const indexMessages: estypes.IndicesCreateRequest = {
    index: `20240528_${envs.NANGO_LOGS_ES_INDEX_MESSAGES ?? 'messages'}`,
    settings: buildMessagesSettings() as NonNullable<estypes.IndicesCreateRequest['settings']>,
    mappings: {
        _source: { enabled: true },
        dynamic: false,
        properties: propsMessages
    }
};
