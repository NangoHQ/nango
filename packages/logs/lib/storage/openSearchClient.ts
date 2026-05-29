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

function splitSearchParams(params: LogsSearchParams): Parameters<OpenSearchClient['search']>[0] {
    const { index, size, sort, track_total_hits, search_after, query, aggs } = params;
    const body = {
        ...(query !== undefined ? { query } : {}),
        ...(aggs !== undefined ? { aggs } : {}),
        ...(sort !== undefined ? { sort } : {}),
        ...(search_after !== undefined ? { search_after } : {}),
        ...(track_total_hits !== undefined ? { track_total_hits } : {})
    };
    if (Object.keys(body).length === 0) {
        return {
            index,
            ...(size !== undefined ? { size } : {})
        };
    }
    return {
        index,
        ...(size !== undefined ? { size } : {}),
        body
    };
}

function mapIndexParams<TDocument>(params: LogsIndexParams<TDocument>): Parameters<OpenSearchClient['index']>[0] {
    const { index, document, refresh, pipeline } = params;
    return {
        index,
        ...(refresh !== undefined ? { refresh } : {}),
        ...(pipeline !== undefined ? { pipeline } : {}),
        body: document
    };
}

function mapCreateParams<TDocument>(params: LogsCreateParams<TDocument>): Parameters<OpenSearchClient['create']>[0] {
    const { index, id, document, refresh, pipeline } = params;
    return {
        index,
        id,
        ...(refresh !== undefined ? { refresh } : {}),
        ...(pipeline !== undefined ? { pipeline } : {}),
        body: document
    };
}

function splitUpdateByQueryParams(params: LogsUpdateByQueryParams): Parameters<OpenSearchClient['updateByQuery']>[0] {
    const { index, wait_for_completion, refresh, query, script } = params;
    return {
        index,
        ...(wait_for_completion !== undefined ? { wait_for_completion } : {}),
        ...(refresh !== undefined ? { refresh } : {}),
        body: { query, script }
    };
}

function mapPutIndexTemplateParams(params: LogsPutIndexTemplateParams): Parameters<OpenSearchClient['indices']['putIndexTemplate']>[0] {
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

function mapPutPipelineParams(params: LogsPutPipelineParams): Parameters<OpenSearchClient['ingest']['putPipeline']>[0] {
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
        const res = await this.client.index(mapIndexParams(params));
        const body = unwrapOpenSearchResult<{ _index: string }>(res);
        return { _index: body._index };
    }

    async create<TDocument>(params: LogsCreateParams<TDocument>): Promise<LogsIndexResult> {
        const res = await this.client.create(mapCreateParams(params));
        const body = unwrapOpenSearchResult<{ _index: string }>(res);
        return { _index: body._index };
    }

    async update(params: LogsUpdateParams): Promise<void> {
        await this.client.update(params);
    }

    async updateByQuery(params: LogsUpdateByQueryParams): Promise<void> {
        await this.client.updateByQuery(splitUpdateByQueryParams(params));
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
            await this.client.indices.putIndexTemplate(mapPutIndexTemplateParams(params));
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
            await this.client.ingest.putPipeline(mapPutPipelineParams(params));
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
