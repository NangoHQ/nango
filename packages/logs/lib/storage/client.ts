import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';

import { envs } from '../env.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { putIsmPolicies } from '../opensearch/ismPolicies.js';

/** Typed as Elasticsearch client; OpenSearch client is API-compatible for our usage. */
export type LogsStorageClient = ElasticsearchClient;

export type LogsStorageProvider = 'elasticsearch' | 'opensearch';

interface LogsStorageClientConfig {
    nodes: string;
    requestTimeout: number;
    maxRetries: number;
    auth: {
        username: string;
        password: string;
    };
}

export interface LogsStoragePolicies {
    messagesPolicy: unknown;
    operationsPolicy: unknown;
}

export interface LogsStorageAdapter {
    provider: LogsStorageProvider;
    createRawClient(common: LogsStorageClientConfig): ElasticsearchClient;
    mapArgs(methodName: string, args: unknown[]): unknown[];
    unwrapResult<T>(result: unknown): T;
    setupPolicies(client: ElasticsearchClient, policies: LogsStoragePolicies): Promise<void>;
}

function createClientConfig(): LogsStorageClientConfig {
    return {
        nodes: envs.NANGO_LOGS_ES_URL || 'http://localhost:0',
        requestTimeout: envs.NANGO_LOGS_ES_REQUEST_TIMEOUT_MS,
        maxRetries: envs.NANGO_LOGS_ES_MAX_RETRIES,
        auth: {
            username: envs.NANGO_LOGS_ES_USER!, // ggignore
            password: envs.NANGO_LOGS_ES_PWD! // ggignore
        }
    };
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

const OPENSEARCH_UPDATE_BY_QUERY_BODY_FIELDS = new Set(['query', 'script', 'conflicts', 'max_docs', 'scroll', 'scroll_size', 'slices', 'sort']);

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

function mapUpdateByQueryArgsForOpenSearch(first: Record<string, unknown>): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    const rest: Record<string, unknown> = {};

    for (const key of Object.keys(first)) {
        const val = first[key];
        if (OPENSEARCH_UPDATE_BY_QUERY_BODY_FIELDS.has(key) && val !== undefined) {
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

/** Recurse into API namespace objects (e.g. indices, cat, ingest) which are class instances, not plain objects. */
function shouldWrapNamespace(value: unknown): value is object {
    if (value === null || typeof value !== 'object') {
        return false;
    }
    if (value instanceof Date || value instanceof RegExp) {
        return false;
    }
    return true;
}

/**
 * OpenSearch JS expects indexed documents in `body`; Elasticsearch v8 accepts `document`
 * and maps it. Normalize here so call sites can keep the ES8 shape.
 */
export function mapArgsForOpenSearch(methodName: string, args: unknown[], provider: 'elasticsearch' | 'opensearch' = envs.NANGO_LOGS_PROVIDER): unknown[] {
    if (provider !== 'opensearch' || args.length === 0) {
        return args;
    }
    const first = args[0];
    if (!first || typeof first !== 'object') {
        return args;
    }
    const params = first as Record<string, unknown>;
    if (params['body'] !== undefined) {
        return args;
    }
    if (methodName === 'search') {
        return [{ ...mapSearchArgsForOpenSearch(params) }, ...args.slice(1)];
    }
    if (methodName === 'updateByQuery') {
        return [{ ...mapUpdateByQueryArgsForOpenSearch(params) }, ...args.slice(1)];
    }
    if ((methodName === 'create' || methodName === 'index') && 'document' in params) {
        const { document, ...rest } = params;
        return [{ ...rest, body: document }, ...args.slice(1)];
    }
    if (methodName === 'putIndexTemplate' && 'template' in params) {
        const { name, index_patterns, template, ...rest } = params;
        const patterns = index_patterns === undefined ? undefined : Array.isArray(index_patterns) ? index_patterns : [index_patterns];
        return [
            {
                name,
                body: {
                    ...rest,
                    ...(patterns !== undefined ? { index_patterns: patterns } : {}),
                    template
                }
            },
            ...args.slice(1)
        ];
    }
    if (methodName === 'putPipeline' && ('processors' in params || 'description' in params)) {
        const { id, description, processors, ...rest } = params;
        return [
            {
                id,
                body: {
                    ...rest,
                    ...(description !== undefined ? { description } : {}),
                    ...(processors !== undefined ? { processors } : {})
                }
            },
            ...args.slice(1)
        ];
    }
    return args;
}

function isOpenSearchTransportEnvelope(result: unknown): result is { body: unknown; statusCode: number } {
    return result !== null && typeof result === 'object' && 'body' in result && 'statusCode' in result;
}

/**
 * OpenSearch JS returns the legacy transport envelope `{ body, statusCode, headers, meta }`.
 * Elasticsearch v8 returns the deserialized API body directly — our models expect that shape.
 */
export function unwrapOpenSearchResult<T>(result: unknown): T {
    if (!isOpenSearchTransportEnvelope(result)) {
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

const elasticsearchAdapter: LogsStorageAdapter = {
    provider: 'elasticsearch',
    createRawClient(common) {
        return new ElasticsearchClient(common);
    },
    mapArgs(_methodName, args) {
        return args;
    },
    unwrapResult<T>(result: unknown): T {
        return result as T;
    },
    async setupPolicies(client, policies) {
        await client.ilm.putLifecycle(policies.messagesPolicy as any);
        await client.ilm.putLifecycle(policies.operationsPolicy as any);
    }
};

const openSearchAdapter: LogsStorageAdapter = {
    provider: 'opensearch',
    createRawClient(common) {
        return new OpenSearchClient(common) as unknown as ElasticsearchClient;
    },
    mapArgs(methodName, args) {
        return mapArgsForOpenSearch(methodName, args, 'opensearch');
    },
    unwrapResult<T>(result: unknown): T {
        return unwrapOpenSearchResult<T>(result);
    },
    async setupPolicies(client) {
        await putIsmPolicies(client as unknown as OpenSearchClient);
    }
};

export function getLogsStorageAdapter(provider: LogsStorageProvider): LogsStorageAdapter {
    return provider === 'opensearch' ? openSearchAdapter : elasticsearchAdapter;
}

export function wrapStorageClient(raw: ElasticsearchClient, circuitBreaker: CircuitBreaker, adapter: LogsStorageAdapter): ElasticsearchClient {
    function wrap<T extends object>(obj: T): T {
        return new Proxy(obj, {
            get(targetObj, prop, receiver) {
                const value = Reflect.get(targetObj, prop, receiver);

                if (typeof value === 'function') {
                    return async function (...args: unknown[]) {
                        if (circuitBreaker.isUnhealthy()) {
                            throw new Error('Logs storage circuit breaker is unhealthy - failing fast');
                        }

                        if (prop === 'close') {
                            circuitBreaker.destroy();
                        }

                        const mappedArgs = adapter.mapArgs(String(prop), args);
                        const result = await value.apply(targetObj, mappedArgs);
                        if (prop !== 'close') {
                            return adapter.unwrapResult(result);
                        }
                        return result;
                    };
                }

                if (shouldWrapNamespace(value)) {
                    return wrap(value);
                }

                return value;
            }
        });
    }

    return wrap(raw);
}

function withCircuitBreaker(target: ElasticsearchClient, adapter: LogsStorageAdapter): ElasticsearchClient {
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
    return wrapStorageClient(target, circuitBreaker, adapter);
}

export class LogsStorage {
    public readonly provider: LogsStorageProvider;
    public readonly adapter: LogsStorageAdapter;
    public readonly client: LogsStorageClient;

    constructor(provider: LogsStorageProvider = envs.NANGO_LOGS_PROVIDER) {
        this.provider = provider;
        this.adapter = getLogsStorageAdapter(provider);
        this.client = withCircuitBreaker(this.adapter.createRawClient(createClientConfig()), this.adapter);
    }

    async setupPolicies(policies: LogsStoragePolicies): Promise<void> {
        await this.adapter.setupPolicies(this.client, policies);
    }
}

export const logsStorage = new LogsStorage();
export const client = logsStorage.client;
