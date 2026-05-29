import type {
    LogsCatIndexRow,
    LogsCreateParams,
    LogsDocumentBody,
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
    LogsUpdateByQueryParams,
    LogsUpdateParams
} from './types.js';

export interface LogsIndicesClient {
    existsIndexTemplate(params: { name: string }): Promise<boolean>;
    putIndexTemplate(params: LogsPutIndexTemplateParams): Promise<void>;
    exists(params: { index: string }): Promise<boolean>;
    getMapping(params: { index: string }): Promise<LogsIndicesMapping>;
    getSettings(params: { index: string }): Promise<LogsIndicesSettings>;
    delete(params: { index: string; ignore_unavailable?: boolean }): Promise<void>;
}

export interface LogsIngestClient {
    putPipeline(params: LogsPutPipelineParams): Promise<void>;
}

export interface LogsCatClient {
    indices(params: { format: 'json' }): Promise<LogsCatIndexRow[]>;
}

export interface LogsStorageClient {
    search<TDocument = unknown, TAggregations = Record<string, unknown>>(params: LogsSearchParams): Promise<LogsSearchResponse<TDocument, TAggregations>>;
    index<TDocument extends LogsDocumentBody>(params: LogsIndexParams<TDocument>): Promise<LogsIndexResult>;
    create<TDocument extends LogsDocumentBody>(params: LogsCreateParams<TDocument>): Promise<LogsIndexResult>;
    update(params: LogsUpdateParams): Promise<void>;
    updateByQuery(params: LogsUpdateByQueryParams): Promise<void>;
    get<TDocument>(params: LogsGetParams): Promise<LogsGetResult<TDocument>>;
    indices: LogsIndicesClient;
    ingest: LogsIngestClient;
    cat: LogsCatClient;
    close(): Promise<void>;
}
