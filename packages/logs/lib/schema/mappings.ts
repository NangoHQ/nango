import type { estypes } from '@elastic/elasticsearch';
import type { MessageRow, OperationRow } from '@nangohq/types';

export const propsOperations: Record<keyof OperationRow, estypes.MappingProperty> = {
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
export const propsMessages: Record<keyof MessageRow | keyof OperationRow, estypes.MappingProperty> = {
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
