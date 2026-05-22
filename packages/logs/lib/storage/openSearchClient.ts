import { Client as OpenSearchClient } from '@opensearch-project/opensearch';

import { putIsmPolicies } from '../opensearch/ismPolicies.js';

import type { LogsStorageClient } from './logsStorageClient.js';
import type {
    LogsCatIndexRow,
    LogsCreateParams,
    LogsGetParams,
    LogsGetResult,
    LogsIndexParams,
    LogsIndexResult,
    LogsIndicesMapping,
    LogsIndicesSettings,
    LogsPutIndexTemplateParams,
    LogsPutPipelineParams,
    LogsSearchParams,
    LogsSearchResponse,
    LogsStorageClientConfig,
    LogsStoragePolicies,
    LogsUpdateByQueryParams,
    LogsUpdateParams
} from './types.js';

const SEARCH_BODY_FIELDS = new Set([
    'query',
    'aggs',
    'aggregations',
    'sort',
    'search_after',
    'track_total_hits',
    'post_filter',
    'collapse',
    'pit',
    'suggest',
    'highlight',
    'rescore',
    'script_fields',
    'stored_fields',
    'docvalue_fields',
    '_source',
    'fields',
    'runtime_mappings',
    'indices_boost',
    'min_score',
    'seq_no_primary_term',
    'explain',
    'version'
]);

const UPDATE_BY_QUERY_BODY_FIELDS = new Set(['query', 'script', 'conflicts', 'max_docs', 'scroll', 'scroll_size', 'slices', 'sort']);

function isTransportEnvelope(result: unknown): result is { body: unknown; statusCode: number } {
    return result !== null && typeof result === 'object' && 'body' in result && 'statusCode' in result;
}

function unwrapOpenSearchResult<T>(result: unknown): T {
    if (!isTransportEnvelope(result)) {
        return result as T;
    }

    let body = result.body;
    if (typeof body === 'string') {
        const trimmed = body.trim();
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
                body = JSON.parse(trimmed) as T;
            } catch {
                return body as T;
            }
        }
    }

    return body as T;
}

function splitSearchParams(params: LogsSearchParams): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    const rest: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(params)) {
        if (SEARCH_BODY_FIELDS.has(key) && val !== undefined) {
            body[key] = val;
        } else {
            rest[key] = val;
        }
    }

    if (Object.keys(body).length === 0) {
        return { ...params };
    }
    return { ...rest, body };
}

function splitUpdateByQueryParams(params: LogsUpdateByQueryParams): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    const rest: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(params)) {
        if (UPDATE_BY_QUERY_BODY_FIELDS.has(key) && val !== undefined) {
            body[key] = val;
        } else {
            rest[key] = val;
        }
    }

    if (Object.keys(body).length === 0) {
        return { ...params };
    }
    return { ...rest, body };
}

function mapPutIndexTemplateParams(params: LogsPutIndexTemplateParams): Record<string, unknown> {
    const { name, index_patterns, template, create, cause, cluster_manager_timeout } = params;
    const patterns = Array.isArray(index_patterns) ? index_patterns : [index_patterns];
    return {
        name,
        ...(create !== undefined ? { create } : {}),
        ...(cause !== undefined ? { cause } : {}),
        ...(cluster_manager_timeout !== undefined ? { cluster_manager_timeout } : {}),
        body: {
            index_patterns: patterns,
            template
        }
    };
}

function mapPutPipelineParams(params: LogsPutPipelineParams): Record<string, unknown> {
    const { id, description, processors, timeout, cluster_manager_timeout } = params;
    return {
        id,
        ...(timeout !== undefined ? { timeout } : {}),
        ...(cluster_manager_timeout !== undefined ? { cluster_manager_timeout } : {}),
        body: {
            ...(description !== undefined ? { description } : {}),
            ...(processors !== undefined ? { processors } : {})
        }
    };
}

export class OpenSearchLogsClient implements LogsStorageClient {
    private readonly client: OpenSearchClient;

    constructor(config: LogsStorageClientConfig) {
        this.client = new OpenSearchClient(config);
    }

    async search<TDocument, TAggregations>(params: LogsSearchParams): Promise<LogsSearchResponse<TDocument, TAggregations>> {
        const res = await this.client.search(splitSearchParams(params));
        return unwrapOpenSearchResult(res);
    }

    async index<TDocument>(params: LogsIndexParams<TDocument>): Promise<LogsIndexResult> {
        const { document, ...rest } = params;
        const res = await this.client.index({ ...rest, body: document } as Parameters<OpenSearchClient['index']>[0]);
        const body = unwrapOpenSearchResult<{ _index: string }>(res);
        return { _index: body._index };
    }

    async create<TDocument>(params: LogsCreateParams<TDocument>): Promise<LogsIndexResult> {
        const { document, ...rest } = params;
        const res = await this.client.create({ ...rest, body: document } as Parameters<OpenSearchClient['create']>[0]);
        const body = unwrapOpenSearchResult<{ _index: string }>(res);
        return { _index: body._index };
    }

    async update(params: LogsUpdateParams): Promise<void> {
        await this.client.update(params);
    }

    async updateByQuery(params: LogsUpdateByQueryParams): Promise<void> {
        await this.client.updateByQuery(splitUpdateByQueryParams(params) as unknown as Parameters<OpenSearchClient['updateByQuery']>[0]);
    }

    async get<TDocument>(params: LogsGetParams): Promise<LogsGetResult<TDocument>> {
        const res = await this.client.get(params);
        const body = unwrapOpenSearchResult<{ _source?: TDocument }>(res);
        return { _source: body._source };
    }

    readonly indices = {
        existsIndexTemplate: async (params: { name: string }): Promise<boolean> => {
            const res = await this.client.indices.existsIndexTemplate(params);
            return unwrapOpenSearchResult(res);
        },
        putIndexTemplate: async (params: LogsPutIndexTemplateParams): Promise<void> => {
            await this.client.indices.putIndexTemplate(
                mapPutIndexTemplateParams(params) as unknown as Parameters<OpenSearchClient['indices']['putIndexTemplate']>[0]
            );
        },
        exists: async (params: { index: string }): Promise<boolean> => {
            const res = await this.client.indices.exists(params);
            return unwrapOpenSearchResult(res);
        },
        getMapping: async (params: { index: string }) => {
            const res = await this.client.indices.getMapping(params);
            return unwrapOpenSearchResult<LogsIndicesMapping>(res);
        },
        getSettings: async (params: { index: string }) => {
            const res = await this.client.indices.getSettings(params);
            return unwrapOpenSearchResult<LogsIndicesSettings>(res);
        },
        delete: async (params: { index: string; ignore_unavailable?: boolean }): Promise<void> => {
            await this.client.indices.delete(params);
        }
    };

    readonly ingest = {
        putPipeline: async (params: LogsPutPipelineParams): Promise<void> => {
            await this.client.ingest.putPipeline(mapPutPipelineParams(params) as unknown as Parameters<OpenSearchClient['ingest']['putPipeline']>[0]);
        }
    };

    readonly cat = {
        indices: async (params: { format: 'json' }): Promise<LogsCatIndexRow[]> => {
            const res = await this.client.cat.indices(params);
            return unwrapOpenSearchResult<LogsCatIndexRow[]>(res);
        }
    };

    async healthCheck(): Promise<boolean> {
        try {
            await this.client.cluster.health();
            return true;
        } catch {
            return false;
        }
    }

    async setupRetentionPolicies(_policies: LogsStoragePolicies): Promise<void> {
        await putIsmPolicies(this.client);
    }

    async close(): Promise<void> {
        await this.client.close();
    }
}
