import { envs } from '../env.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { CircuitBreakerLogsClient } from './circuitBreakerLogsClient.js';
import { ElasticsearchLogsClient } from './elasticsearchClient.js';
import { OpenSearchLogsClient } from './openSearchClient.js';

import type { LogsStorageBackend } from './circuitBreakerLogsClient.js';
import type { LogsStorageClient } from './logsStorageClient.js';
import type { LogsStorageClientConfig, LogsStoragePolicies, LogsStorageProvider } from './types.js';

export type { LogsStorageClient } from './logsStorageClient.js';
export type { LogsStoragePolicies, LogsStorageProvider } from './types.js';

function createClientConfig(provider: LogsStorageProvider = envs.NANGO_LOGS_PROVIDER): LogsStorageClientConfig {
    const serverless = provider === 'ec-serverless';
    return {
        nodes: envs.NANGO_LOGS_ES_URL || 'http://localhost:0',
        requestTimeout: envs.NANGO_LOGS_ES_REQUEST_TIMEOUT_MS,
        maxRetries: envs.NANGO_LOGS_ES_MAX_RETRIES,
        auth: serverless
            ? { apiKey: envs.NANGO_LOGS_ES_API_KEY! } // ggignore
            : {
                  username: envs.NANGO_LOGS_ES_USER!, // ggignore
                  password: envs.NANGO_LOGS_ES_PWD! // ggignore
              },
        ...(serverless ? { serverless: true } : {})
    };
}

export function createLogsStorageBackend(provider: LogsStorageProvider, config: LogsStorageClientConfig = createClientConfig(provider)): LogsStorageBackend {
    if (provider === 'opensearch') {
        return new OpenSearchLogsClient(config);
    }
    return new ElasticsearchLogsClient(config);
}

function withCircuitBreaker(backend: LogsStorageBackend): LogsStorageClient {
    const circuitBreaker = new CircuitBreaker({
        healthCheck: () => backend.healthCheck(),
        healthCheckIntervalMs: envs.NANGO_LOGS_CIRCUIT_BREAKER_HEALTHCHECK_INTERVAL_MS,
        failureThreshold: envs.NANGO_LOGS_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
        recoveryThreshold: envs.NANGO_LOGS_CIRCUIT_BREAKER_RECOVERY_THRESHOLD
    });
    return new CircuitBreakerLogsClient(backend, circuitBreaker);
}

export class LogsStorage {
    public readonly provider: LogsStorageProvider;
    public readonly client: LogsStorageClient;
    private readonly backend: LogsStorageBackend;

    constructor(provider: LogsStorageProvider = envs.NANGO_LOGS_PROVIDER) {
        this.provider = provider;
        this.backend = createLogsStorageBackend(provider);
        this.client = withCircuitBreaker(this.backend);
    }

    async setupPolicies(policies: LogsStoragePolicies): Promise<void> {
        await this.backend.setupRetentionPolicies(policies);
    }

    async putDataStreamLifecycle(name: string, dataRetention: string): Promise<void> {
        if (!(this.backend instanceof ElasticsearchLogsClient)) {
            throw new Error('Data stream lifecycle is only supported for Elasticsearch');
        }
        await this.backend.putDataStreamLifecycle({ name, data_retention: dataRetention });
    }
}

export const logsStorage = new LogsStorage();
export const client = logsStorage.client;
