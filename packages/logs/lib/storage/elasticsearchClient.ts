import { Client as ElasticsearchClient } from '@elastic/elasticsearch';

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

export class ElasticsearchLogsClient implements LogsStorageClient {
    private readonly client: ElasticsearchClient;

    constructor(config: LogsStorageClientConfig) {
        this.client = new ElasticsearchClient(config);
    }

    async search<TDocument, TAggregations>(params: LogsSearchParams): Promise<LogsSearchResponse<TDocument, TAggregations>> {
        return (await this.client.search(params)) as LogsSearchResponse<TDocument, TAggregations>;
    }

    async index<TDocument>(params: LogsIndexParams<TDocument>): Promise<LogsIndexResult> {
        const res = await this.client.index(params);
        return { _index: res._index };
    }

    async create<TDocument>(params: LogsCreateParams<TDocument>): Promise<LogsIndexResult> {
        const res = await this.client.create(params);
        return { _index: res._index };
    }

    async update(params: LogsUpdateParams): Promise<void> {
        await this.client.update(params);
    }

    async updateByQuery(params: LogsUpdateByQueryParams): Promise<void> {
        await this.client.updateByQuery(params);
    }

    async get<TDocument>(params: LogsGetParams): Promise<LogsGetResult<TDocument>> {
        const res = await this.client.get<TDocument>(params);
        return { _source: res._source };
    }

    readonly indices = {
        existsIndexTemplate: async (params: { name: string }): Promise<boolean> => {
            return await this.client.indices.existsIndexTemplate(params);
        },
        putIndexTemplate: async (params: LogsPutIndexTemplateParams): Promise<void> => {
            await this.client.indices.putIndexTemplate(params);
        },
        exists: async (params: { index: string }): Promise<boolean> => {
            return await this.client.indices.exists(params);
        },
        getMapping: async (params: { index: string }) => {
            return (await this.client.indices.getMapping(params)) as LogsIndicesMapping;
        },
        getSettings: async (params: { index: string }) => {
            return (await this.client.indices.getSettings(params)) as LogsIndicesSettings;
        },
        delete: async (params: { index: string; ignore_unavailable?: boolean }): Promise<void> => {
            await this.client.indices.delete(params);
        }
    };

    readonly ingest = {
        putPipeline: async (params: LogsPutPipelineParams): Promise<void> => {
            await this.client.ingest.putPipeline(params);
        }
    };

    readonly cat = {
        indices: async (params: { format: 'json' }): Promise<LogsCatIndexRow[]> => {
            return (await this.client.cat.indices(params)) as LogsCatIndexRow[];
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

    async setupRetentionPolicies(policies: LogsStoragePolicies): Promise<void> {
        await this.client.ilm.putLifecycle(policies.messagesPolicy);
        await this.client.ilm.putLifecycle(policies.operationsPolicy);
    }

    async close(): Promise<void> {
        await this.client.close();
    }
}
