import type { estypes } from '@elastic/elasticsearch';
import type { MessageRow, OperationRow } from '@nangohq/types';
import { envs } from '../env.js';

const props: Record<keyof MessageRow | keyof OperationRow, estypes.MappingProperty> = {
    id: { type: 'keyword' },

    parentId: { type: 'keyword' },

    accountId: { type: 'keyword' },
    accountName: { type: 'keyword' },

    environmentId: { type: 'keyword' },
    environmentName: { type: 'keyword' },

    integrationId: { type: 'keyword' },
    integrationName: {
        type: 'text',
        analyzer: 'standard',
        search_analyzer: 'standard',
        fields: {
            keyword: {
                type: 'keyword'
            }
        }
    },
    providerName: { type: 'keyword' },

    connectionId: { type: 'keyword' },
    connectionName: {
        type: 'text',
        analyzer: 'standard',
        search_analyzer: 'standard',
        fields: {
            keyword: {
                type: 'keyword'
            }
        }
    },
    endUserId: { type: 'keyword' },
    endUserName: { type: 'keyword' },

    syncConfigId: { type: 'keyword' },
    syncConfigName: {
        type: 'text',
        analyzer: 'standard',
        search_analyzer: 'standard',
        fields: {
            keyword: {
                type: 'keyword'
            }
        }
    },

    jobId: { type: 'keyword' },

    userId: { type: 'keyword' },

    operation: {
        properties: {
            type: { type: 'keyword' },
            action: { type: 'keyword' }
        }
    },

    type: { type: 'keyword' },
    level: { type: 'keyword' },
    state: { type: 'keyword' },
    context: { type: 'keyword' },

    source: { type: 'keyword' },

    message: { type: 'text', analyzer: 'standard', search_analyzer: 'standard' },
    meta: { type: 'object', enabled: false },
    error: { type: 'object', enabled: false },

    request: {
        properties: {
            url: { type: 'keyword' },
            method: { type: 'keyword' },
            headers: { type: 'object', enabled: false }
        }
    },
    response: {
        properties: {
            code: { type: 'integer' },
            headers: { type: 'object', enabled: false }
        }
    },
    retry: {
        properties: {
            max: { type: 'integer' },
            attempt: { type: 'integer' },
            waited: { type: 'integer' }
        }
    },

    createdAt: { type: 'date' },
    updatedAt: { type: 'date' },
    startedAt: { type: 'date' },
    expiresAt: { type: 'date' },
    endedAt: { type: 'date' },
    durationMs: { type: 'integer' }
};

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

export function policyRetention(): estypes.IlmPutLifecycleRequest {
    return {
        name: 'policy_retention',
        policy: {
            phases: {
                delete: { min_age: '15d', actions: { delete: {} } }
            }
        }
    };
}

export const indexMessages: estypes.IndicesCreateRequest = {
    index: `20240528_${envs.NANGO_LOGS_ES_INDEX ?? 'messages'}`,
    settings: {
        lifecycle: { name: 'policy_retention' },
        analysis: {
            analyzer: {
                default: {
                    type: 'standard'
                },
                default_search: {
                    type: 'standard'
                }
            }
        },
        index: {
            'sort.field': ['createdAt', 'id'],
            'sort.order': ['desc', 'desc']
        },
        // They are recommending 1 shard per 20gb-40gb
        number_of_shards: envs.NANGO_LOGS_ES_SHARD_PER_DAY
    },
    mappings: {
        _source: { enabled: true },
        dynamic: false,
        properties: props
    }
};
