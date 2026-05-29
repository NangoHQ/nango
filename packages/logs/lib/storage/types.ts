import type { estypes } from '@elastic/elasticsearch';

export type LogsStorageProvider = 'elasticsearch' | 'opensearch';

export interface LogsStorageClientConfig {
    nodes: string;
    requestTimeout: number;
    maxRetries: number;
    auth: {
        username: string;
        password: string;
    };
}

export interface LogsStoragePolicies {
    messagesPolicy: estypes.IlmPutLifecycleRequest;
    operationsPolicy: estypes.IlmPutLifecycleRequest;
}

export interface LogsSearchHit<TDocument> {
    _source?: TDocument;
    sort?: estypes.SortResults;
}

export interface LogsSearchResponse<TDocument = unknown, TAggregations = Record<string, estypes.AggregationsAggregate>> {
    hits: {
        total: number | estypes.SearchTotalHits;
        hits: LogsSearchHit<TDocument>[];
    };
    aggregations?: TAggregations;
}

export interface LogsSearchParams {
    index: string;
    size?: number;
    sort?: estypes.Sort;
    track_total_hits?: boolean | number;
    search_after?: estypes.SortResults | undefined;
    query?: estypes.QueryDslQueryContainer;
    aggs?: Record<string, estypes.AggregationsAggregationContainer>;
}

export interface LogsIndexParams<TDocument> {
    index: string;
    document: TDocument;
    refresh?: boolean;
    pipeline?: string;
}

export interface LogsCreateParams<TDocument> {
    index: string;
    id: string;
    document: TDocument;
    refresh?: boolean;
    pipeline?: string;
}

export interface LogsIndexResult {
    _index: string;
}

export interface LogsGetParams {
    index: string;
    id: string;
}

export interface LogsGetResult<TDocument> {
    _source?: TDocument | undefined;
}

export interface LogsUpdateParams {
    index: string;
    id: string;
    retry_on_conflict?: number;
    refresh?: boolean;
    body: {
        doc: Record<string, unknown>;
    };
}

export interface LogsUpdateByQueryParams {
    index: string;
    wait_for_completion?: boolean;
    refresh?: boolean;
    query: estypes.QueryDslQueryContainer;
    script: { source: string };
}

export interface LogsPutIndexTemplateParams {
    name: string;
    index_patterns: string | string[];
    template: {
        settings?: Record<string, unknown>;
        mappings?: Record<string, unknown>;
        aliases?: Record<string, Record<string, never>>;
    };
    create?: boolean;
    cause?: string;
    cluster_manager_timeout?: string;
}

export interface LogsPutPipelineParams {
    id: string;
    description?: string;
    processors?: estypes.IngestProcessorContainer[];
    timeout?: estypes.Duration;
    cluster_manager_timeout?: estypes.Duration;
}

export interface LogsCatIndexRow {
    index?: string;
}

export type LogsIndicesMapping = Record<
    string,
    {
        mappings?: Record<string, unknown>;
    }
>;

export type LogsIndicesSettings = Record<
    string,
    {
        settings?: {
            index?: Record<string, unknown>;
        };
    }
>;
