import type { CircuitBreaker } from './circuitBreaker.js';
import type { LogsStorageClient } from './logsStorageClient.js';
import type { LogsGetResult, LogsSearchParams, LogsSearchResponse, LogsStoragePolicies } from './types.js';

export interface LogsStorageBackend extends LogsStorageClient {
    healthCheck(): Promise<boolean>;
    setupRetentionPolicies(policies: LogsStoragePolicies): Promise<void>;
}

export class CircuitBreakerLogsClient implements LogsStorageClient {
    readonly indices: LogsStorageClient['indices'];
    readonly ingest: LogsStorageClient['ingest'];
    readonly cat: LogsStorageClient['cat'];

    constructor(
        private readonly backend: LogsStorageBackend,
        private readonly circuitBreaker: CircuitBreaker
    ) {
        this.indices = {
            existsIndexTemplate: async (params) => {
                this.circuitBreaker.guard();
                return this.backend.indices.existsIndexTemplate(params);
            },
            putIndexTemplate: async (params) => {
                this.circuitBreaker.guard();
                return this.backend.indices.putIndexTemplate(params);
            },
            exists: async (params) => {
                this.circuitBreaker.guard();
                return this.backend.indices.exists(params);
            },
            getMapping: async (params) => {
                this.circuitBreaker.guard();
                return this.backend.indices.getMapping(params);
            },
            getSettings: async (params) => {
                this.circuitBreaker.guard();
                return this.backend.indices.getSettings(params);
            },
            delete: async (params) => {
                this.circuitBreaker.guard();
                return this.backend.indices.delete(params);
            }
        };

        this.ingest = {
            putPipeline: async (params) => {
                this.circuitBreaker.guard();
                return this.backend.ingest.putPipeline(params);
            }
        };

        this.cat = {
            indices: async (params) => {
                this.circuitBreaker.guard();
                return this.backend.cat.indices(params);
            }
        };
    }

    async search<TDocument = unknown, TAggregations = Record<string, unknown>>(
        params: LogsSearchParams
    ): Promise<LogsSearchResponse<TDocument, TAggregations>> {
        this.circuitBreaker.guard();
        return this.backend.search<TDocument, TAggregations>(params);
    }

    async index(params: Parameters<LogsStorageClient['index']>[0]): ReturnType<LogsStorageClient['index']> {
        this.circuitBreaker.guard();
        return this.backend.index(params);
    }

    async create(params: Parameters<LogsStorageClient['create']>[0]): ReturnType<LogsStorageClient['create']> {
        this.circuitBreaker.guard();
        return this.backend.create(params);
    }

    async update(params: Parameters<LogsStorageClient['update']>[0]): ReturnType<LogsStorageClient['update']> {
        this.circuitBreaker.guard();
        return this.backend.update(params);
    }

    async updateByQuery(params: Parameters<LogsStorageClient['updateByQuery']>[0]): ReturnType<LogsStorageClient['updateByQuery']> {
        this.circuitBreaker.guard();
        return this.backend.updateByQuery(params);
    }

    async get<TDocument>(params: Parameters<LogsStorageClient['get']>[0]): Promise<LogsGetResult<TDocument>> {
        this.circuitBreaker.guard();
        return this.backend.get<TDocument>(params);
    }

    async close(): Promise<void> {
        this.circuitBreaker.destroy();
        await this.backend.close();
    }
}
