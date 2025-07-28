import { envs } from '../env.js';

import type { estypes } from '@elastic/elasticsearch';
import type { MessageRow, OperationRow } from '@nangohq/types';

const propsOperations: Record<keyof OperationRow, estypes.MappingProperty> = {
    id: { type: 'keyword' },

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

    source: { type: 'keyword' },

    message: { type: 'text', analyzer: 'standard', search_analyzer: 'standard', copy_to: 'meta_search' },

    meta: { type: 'object', enabled: false },
    error: {
        type: 'object',
        properties: {
            name: { type: 'keyword', copy_to: 'meta_search' },
            message: { type: 'keyword', copy_to: 'meta_search' },
            type: { type: 'keyword', copy_to: 'meta_search' },
            payload: { enabled: false }
        }
    },

    request: {
        properties: {
            url: { type: 'keyword' },
            method: { type: 'keyword' },
            headers: { type: 'object', enabled: false }
        }
    },
    response: {
        properties: {
            code: { type: 'integer', copy_to: 'meta_search' },
            headers: { type: 'object', enabled: false }
        }
    },

    createdAt: { type: 'date' },
    updatedAt: { type: 'date' },
    startedAt: { type: 'date' },
    expiresAt: { type: 'date' },
    endedAt: { type: 'date' },
    durationMs: { type: 'integer' },

    // @ts-expect-error it's a dynamic field not stored
    meta_search: { type: 'text', analyzer: 'standard', search_analyzer: 'standard' }
};

// TODO: clean this up after we have migrated
const propsMessages: Record<keyof MessageRow | keyof OperationRow, estypes.MappingProperty> = {
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

    message: { type: 'text', analyzer: 'standard', search_analyzer: 'standard', copy_to: 'meta_search' },

    meta: { type: 'object', enabled: false },
    persistResults: {
        type: 'object',
        properties: {
            model: { type: 'keyword' },
            added: { type: 'integer' },
            addedKeys: { type: 'keyword', copy_to: 'meta_search' },
            updated: { type: 'integer' },
            updatedKeys: { type: 'keyword', copy_to: 'meta_search' },
            deleted: { type: 'integer' },
            deleteKeys: { type: 'keyword', copy_to: 'meta_search' },
            unchanged: { type: 'integer' },
            unchangedKeys: { type: 'keyword', copy_to: 'meta_search' }
        }
    },
    error: {
        type: 'object',
        properties: {
            name: { type: 'keyword', copy_to: 'meta_search' },
            message: { type: 'keyword', copy_to: 'meta_search' },
            type: { type: 'keyword', copy_to: 'meta_search' },
            payload: { enabled: false }
        }
    },

    request: {
        properties: {
            url: { type: 'keyword' },
            method: { type: 'keyword' },
            headers: { type: 'object', enabled: false }
        }
    },
    response: {
        properties: {
            code: { type: 'integer', copy_to: 'meta_search' },
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
    durationMs: { type: 'integer' },

    // @ts-expect-error it's a dynamic field not stored
    meta_search: { type: 'text', analyzer: 'standard', search_analyzer: 'standard' }
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

export const policyOperations = {
    name: `${envs.NANGO_LOGS_ES_PREFIX}_policy_retention_operations`,
    policy: {
        phases: {
            hot: { actions: { set_priority: { priority: 100 } }, min_age: '0ms' },
            warm: {
                min_age: '25h',
                actions: { set_priority: { priority: 50 }, shrink: { max_primary_shard_size: '10gb' }, readonly: {} }
            },
            delete: { min_age: '15d', actions: { delete: {} } }
        }
    }
};

export const indexOperations: estypes.IndicesCreateRequest = {
    index: `20250724_${envs.NANGO_LOGS_ES_INDEX_OPERATIONS ?? 'operations'}`,
    settings: {
        lifecycle: { name: policyOperations.name },
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
        number_of_shards: envs.NANGO_LOGS_ES_SHARD_PER_DAY_OPERATIONS
    },
    mappings: {
        _source: { enabled: true },
        dynamic: false,
        properties: propsOperations
    }
};

export const policyMessages = {
    name: `${envs.NANGO_LOGS_ES_PREFIX}_policy_retention`,
    policy: {
        phases: {
            hot: { actions: { set_priority: { priority: 100 } }, min_age: '0ms' },
            warm: {
                min_age: '25h',
                actions: { set_priority: { priority: 50 }, shrink: { max_primary_shard_size: '10gb' }, readonly: {} }
            },
            delete: { min_age: '15d', actions: { delete: {} } }
        }
    }
};

export const indexMessages: estypes.IndicesCreateRequest = {
    index: `20240528_${envs.NANGO_LOGS_ES_INDEX_MESSAGES ?? 'messages'}`,
    settings: {
        lifecycle: { name: policyMessages.name },
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
        number_of_shards: envs.NANGO_LOGS_ES_SHARD_PER_DAY_MESSAGES
    },
    mappings: {
        _source: { enabled: true },
        dynamic: false,
        properties: propsMessages
    }
};
