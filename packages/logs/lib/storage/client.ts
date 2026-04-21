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

/** Fields that must live in the JSON body for POST /_search (not in the query string). */
const OPENSEARCH_SEARCH_BODY_FIELDS = new Set([
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

/**
 * OpenSearch `search` puts unknown params on the query string; ES v8 sends DSL fields on the
 * request object (which becomes the body). Move DSL fields into `body` so the query runs.
 */
function mapSearchArgsForOpenSearch(first: Record<string, unknown>): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    const rest: Record<string, unknown> = {};

    for (const key of Object.keys(first)) {
        const val = first[key];
        if (OPENSEARCH_SEARCH_BODY_FIELDS.has(key) && val !== undefined) {
            body[key] = val;
        } else {
            rest[key] = val;
        }
    }
    if (Object.keys(body).length === 0) {
        return first;
    }
    return { ...rest, body };
}

/**
 * OpenSearch JS expects indexed documents in `body`; Elasticsearch v8 accepts `document`
 * and maps it. Normalize here so call sites can keep the ES8 shape.
 */
function mapArgsForOpenSearch(methodName: string | symbol, args: any[]): any[] {
    if (envs.NANGO_LOGS_PROVIDER !== 'opensearch' || args.length === 0) {
        return args;
    }
    const first = args[0];
    if (!first || typeof first !== 'object') {
        return args;
    }
    if (methodName === 'search' && first.body === undefined) {
        return [{ ...mapSearchArgsForOpenSearch(first as Record<string, unknown>) }, ...args.slice(1)];
    }
    if (first.body !== undefined) {
        return args;
    }
    if ((methodName === 'create' || methodName === 'index') && 'document' in first) {
        const { document, ...rest } = first;
        return [{ ...rest, body: document }, ...args.slice(1)];
    }
    return args;
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

                const mappedArgs = mapArgsForOpenSearch(prop, args);
                return await originalMethod.apply(targetClient, mappedArgs);
            };
        }
    });
}

export const client = withCircuitBreaker(createRawClient());
