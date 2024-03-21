import type { estypes } from '@elastic/elasticsearch';
import type { OperationRow } from '../types/operations';
import type { MessageRow } from '../types/messages';

const operations: Record<keyof OperationRow, estypes.MappingProperty> = {
    id: { type: 'keyword' },

    accountId: { type: 'keyword' },
    accountName: { type: 'keyword' },

    environmentId: { type: 'keyword' },
    environmentName: { type: 'keyword' },

    configId: { type: 'keyword' },
    configName: { type: 'keyword' },

    connectionId: { type: 'keyword' },
    connectionName: { type: 'keyword' },

    syncId: { type: 'keyword' },
    syncName: { type: 'keyword' },

    jobId: { type: 'keyword' },

    userId: { type: 'keyword' },

    type: { type: 'keyword' },
    title: { type: 'keyword' },
    level: { type: 'keyword' },
    state: { type: 'keyword' },
    code: { type: 'keyword' },

    createdAt: { type: 'date' },
    updatedAt: { type: 'date' },
    startedAt: { type: 'date' },
    endedAt: { type: 'date' }
};

const messages: Record<keyof MessageRow, estypes.MappingProperty> = {
    id: { type: 'keyword' },

    operationId: { type: 'keyword' },

    level: { type: 'keyword' },
    type: { type: 'keyword' },
    source: { type: 'keyword' },

    message: { type: 'text' },
    meta: { type: 'object', enabled: false },
    error: { type: 'object', enabled: false },

    request: {
        properties: {
            url: { type: 'match_only_text' },
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

    createdAt: { type: 'date' }
};

export const indices: estypes.IndicesCreateRequest[] = [
    {
        index: 'operations',
        mappings: {
            properties: operations
        }
    },
    {
        index: 'messages',
        mappings: {
            properties: messages
        }
    }
];
