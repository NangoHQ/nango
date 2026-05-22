import type { CircuitBreaker } from './circuitBreaker.js';
import type { LogsStorageClient } from './logsStorageClient.js';
import type { LogsGetResult, LogsSearchParams, LogsSearchResponse, LogsStoragePolicies } from './types.js';

export interface LogsStorageBackend extends LogsStorageClient {
    healthCheck(): Promise<boolean>;
    setupRetentionPolicies(policies: LogsStoragePolicies): Promise<void>;
}

function guard(circuitBreaker: CircuitBreaker): void {
    if (circuitBreaker.isUnhealthy()) {
        throw new Error('Logs storage circuit breaker is unhealthy - failing fast');
    }
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
                guard(this.circuitBreaker);
                return this.backend.indices.existsIndexTemplate(params);
            },
            putIndexTemplate: async (params) => {
                guard(this.circuitBreaker);
                return this.backend.indices.putIndexTemplate(params);
            },
            exists: async (params) => {
                guard(this.circuitBreaker);
                return this.backend.indices.exists(params);
            },
            getMapping: async (params) => {
                guard(this.circuitBreaker);
                return this.backend.indices.getMapping(params);
            },
            getSettings: async (params) => {
                guard(this.circuitBreaker);
                return this.backend.indices.getSettings(params);
            },
            delete: async (params) => {
                guard(this.circuitBreaker);
                return this.backend.indices.delete(params);
            }
        };

        this.ingest = {
            putPipeline: async (params) => {
                guard(this.circuitBreaker);
                return this.backend.ingest.putPipeline(params);
            }
        };

        this.cat = {
            indices: async (params) => {
                guard(this.circuitBreaker);
                return this.backend.cat.indices(params);
            }
        };
    }

    async search<TDocument = unknown, TAggregations = Record<string, unknown>>(
        params: LogsSearchParams
    ): Promise<LogsSearchResponse<TDocument, TAggregations>> {
        guard(this.circuitBreaker);
        return this.backend.search<TDocument, TAggregations>(params);
    }

    async index(params: Parameters<LogsStorageClient['index']>[0]): ReturnType<LogsStorageClient['index']> {
        guard(this.circuitBreaker);
        return this.backend.index(params);
    }

    async create(params: Parameters<LogsStorageClient['create']>[0]): ReturnType<LogsStorageClient['create']> {
        guard(this.circuitBreaker);
        return this.backend.create(params);
    }

    async update(params: Parameters<LogsStorageClient['update']>[0]): ReturnType<LogsStorageClient['update']> {
        guard(this.circuitBreaker);
        return this.backend.update(params);
    }

    async updateByQuery(params: Parameters<LogsStorageClient['updateByQuery']>[0]): ReturnType<LogsStorageClient['updateByQuery']> {
        guard(this.circuitBreaker);
        return this.backend.updateByQuery(params);
    }

    async get<TDocument>(params: Parameters<LogsStorageClient['get']>[0]): Promise<LogsGetResult<TDocument>> {
        guard(this.circuitBreaker);
        return this.backend.get<TDocument>(params);
    }

    async close(): Promise<void> {
        this.circuitBreaker.destroy();
        await this.backend.close();
    }
}
