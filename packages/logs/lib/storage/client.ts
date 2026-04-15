import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';

import { envs } from '../env.js';
import { CircuitBreaker } from './circuitBreaker.js';

/** Typed as Elasticsearch client; OpenSearch client is API-compatible for our usage. */
export type LogsStorageClient = ElasticsearchClient;

function createRawClient(): ElasticsearchClient {
    const common = {
        nodes: envs.NANGO_LOGS_ES_URL || 'http://localhost:0',
        requestTimeout: envs.NANGO_LOGS_ES_REQUEST_TIMEOUT_MS,
        maxRetries: envs.NANGO_LOGS_ES_MAX_RETRIES,
        auth: {
            username: envs.NANGO_LOGS_ES_USER!, // ggignore
            password: envs.NANGO_LOGS_ES_PWD! // ggignore
        }
    };

    if (envs.NANGO_LOGS_PROVIDER === 'opensearch') {
        return new OpenSearchClient(common) as unknown as ElasticsearchClient;
    }

    return new ElasticsearchClient(common);
}

function withCircuitBreaker(target: ElasticsearchClient): ElasticsearchClient {
    const circuitBreaker = new CircuitBreaker({
        healthCheck: async () => {
            try {
                await target.cluster.health();
                return true;
            } catch {
                return false;
            }
        },
        healthCheckIntervalMs: envs.NANGO_LOGS_CIRCUIT_BREAKER_HEALTHCHECK_INTERVAL_MS,
        failureThreshold: envs.NANGO_LOGS_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
        recoveryThreshold: envs.NANGO_LOGS_CIRCUIT_BREAKER_RECOVERY_THRESHOLD
    });
    return new Proxy(target, {
        get(targetClient, prop) {
            const originalMethod = Reflect.get(targetClient, prop);

            if (typeof originalMethod !== 'function') {
                return originalMethod;
            }

            return async function (...args: any[]) {
                if (circuitBreaker.isUnhealthy()) {
                    throw new Error('Logs storage circuit breaker is unhealthy - failing fast');
                }

                if (prop === 'close') {
                    circuitBreaker.destroy();
                }

                return await originalMethod.apply(targetClient, args);
            };
        }
    });
}

export const client = withCircuitBreaker(createRawClient());
