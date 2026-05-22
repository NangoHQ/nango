import { describe, expect, it, vi } from 'vitest';

import { CircuitBreaker } from './circuitBreaker.js';
import { CircuitBreakerLogsClient } from './circuitBreakerLogsClient.js';
import { LogsStorage, createLogsStorageBackend } from './client.js';
import { ElasticsearchLogsClient } from './elasticsearchClient.js';
import { OpenSearchLogsClient } from './openSearchClient.js';

import type { estypes } from '@elastic/elasticsearch';

function mockOpenSearchClient() {
    return {
        search: vi.fn(),
        index: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateByQuery: vi.fn(),
        get: vi.fn(),
        indices: {
            existsIndexTemplate: vi.fn(),
            putIndexTemplate: vi.fn(),
            exists: vi.fn(),
            getMapping: vi.fn(),
            getSettings: vi.fn(),
            delete: vi.fn()
        },
        ingest: { putPipeline: vi.fn() },
        cat: { indices: vi.fn() },
        cluster: { health: vi.fn().mockResolvedValue({}) },
        close: vi.fn()
    };
}

describe('createLogsStorageBackend', () => {
    it('should create OpenSearchLogsClient for opensearch', () => {
        const backend = createLogsStorageBackend('opensearch', {
            nodes: 'http://localhost:9200',
            requestTimeout: 1000,
            maxRetries: 0,
            auth: { username: 'u', password: 'p' }
        });
        expect(backend).toBeInstanceOf(OpenSearchLogsClient);
    });

    it('should create ElasticsearchLogsClient for elasticsearch', () => {
        const backend = createLogsStorageBackend('elasticsearch', {
            nodes: 'http://localhost:9200',
            requestTimeout: 1000,
            maxRetries: 0,
            auth: { username: 'u', password: 'p' }
        });
        expect(backend).toBeInstanceOf(ElasticsearchLogsClient);
    });
});

describe('LogsStorage', () => {
    it('should select provider from constructor', () => {
        expect(new LogsStorage('opensearch').provider).toBe('opensearch');
        expect(new LogsStorage('elasticsearch').provider).toBe('elasticsearch');
    });
});

describe('OpenSearchLogsClient', () => {
    it('should move search DSL fields into body', async () => {
        const raw = mockOpenSearchClient();
        raw.search.mockResolvedValue({ body: { hits: { total: { value: 0 }, hits: [] } }, statusCode: 200 });
        const client = new OpenSearchLogsClient({
            nodes: 'http://localhost:9200',
            requestTimeout: 1000,
            maxRetries: 0,
            auth: { username: 'u', password: 'p' }
        });
        (client as unknown as { client: typeof raw }).client = raw;

        await client.search({
            index: 'logs',
            size: 10,
            query: { term: { id: '1' } },
            sort: [{ createdAt: 'desc' }]
        });

        expect(raw.search).toHaveBeenCalledWith({
            index: 'logs',
            size: 10,
            body: {
                query: { term: { id: '1' } },
                sort: [{ createdAt: 'desc' }]
            }
        });
    });

    it('should map document to body for index', async () => {
        const raw = mockOpenSearchClient();
        raw.index.mockResolvedValue({ body: { _index: 'logs.2025-01-01' }, statusCode: 201 });
        const client = new OpenSearchLogsClient({
            nodes: 'http://localhost:9200',
            requestTimeout: 1000,
            maxRetries: 0,
            auth: { username: 'u', password: 'p' }
        });
        (client as unknown as { client: typeof raw }).client = raw;

        const res = await client.index({ index: 'logs', document: { id: '1' } });

        expect(raw.index).toHaveBeenCalledWith({ index: 'logs', body: { id: '1' } });
        expect(res).toEqual({ _index: 'logs.2025-01-01' });
    });

    it('should map query and script to body for updateByQuery', async () => {
        const raw = mockOpenSearchClient();
        raw.updateByQuery.mockResolvedValue({ body: {}, statusCode: 200 });
        const client = new OpenSearchLogsClient({
            nodes: 'http://localhost:9200',
            requestTimeout: 1000,
            maxRetries: 0,
            auth: { username: 'u', password: 'p' }
        });
        (client as unknown as { client: typeof raw }).client = raw;

        const query = { term: { state: 'running' } };
        const script = { source: "ctx._source.state = 'cancelled'" };
        await client.updateByQuery({ index: 'logs', query, script });

        expect(raw.updateByQuery).toHaveBeenCalledWith({
            index: 'logs',
            body: { query, script }
        });
    });

    it('should put only template fields in body for putIndexTemplate', async () => {
        const raw = mockOpenSearchClient();
        raw.indices.putIndexTemplate.mockResolvedValue({ body: { acknowledged: true }, statusCode: 200 });
        const client = new OpenSearchLogsClient({
            nodes: 'http://localhost:9200',
            requestTimeout: 1000,
            maxRetries: 0,
            auth: { username: 'u', password: 'p' }
        });
        (client as unknown as { client: typeof raw }).client = raw;

        const template = { settings: {}, mappings: {} };
        await client.indices.putIndexTemplate({
            name: 'logs-template',
            index_patterns: 'logs.*',
            template,
            create: true,
            cluster_manager_timeout: '30s'
        });

        expect(raw.indices.putIndexTemplate).toHaveBeenCalledWith({
            name: 'logs-template',
            create: true,
            cluster_manager_timeout: '30s',
            body: {
                index_patterns: ['logs.*'],
                template
            }
        });
    });

    it('should put only pipeline fields in body for putPipeline', async () => {
        const raw = mockOpenSearchClient();
        raw.ingest.putPipeline.mockResolvedValue({ body: { acknowledged: true }, statusCode: 200 });
        const client = new OpenSearchLogsClient({
            nodes: 'http://localhost:9200',
            requestTimeout: 1000,
            maxRetries: 0,
            auth: { username: 'u', password: 'p' }
        });
        (client as unknown as { client: typeof raw }).client = raw;

        const processors = [{ date_index_name: { field: 'createdAt' } }] as estypes.IngestProcessorContainer[];
        await client.ingest.putPipeline({
            id: 'daily.logs',
            description: 'Daily index',
            processors,
            timeout: '30s'
        });

        expect(raw.ingest.putPipeline).toHaveBeenCalledWith({
            id: 'daily.logs',
            timeout: '30s',
            body: { description: 'Daily index', processors }
        });
    });

    it('should unwrap nested getSettings responses', async () => {
        const inner = { 'logs.2025-01-01': { settings: { index: { number_of_shards: '1' } } } };
        const raw = mockOpenSearchClient();
        raw.indices.getSettings.mockResolvedValue({ body: inner, statusCode: 200 });
        const client = new OpenSearchLogsClient({
            nodes: 'http://localhost:9200',
            requestTimeout: 1000,
            maxRetries: 0,
            auth: { username: 'u', password: 'p' }
        });
        (client as unknown as { client: typeof raw }).client = raw;

        const settings = await client.indices.getSettings({ index: 'logs' });
        expect(settings).toEqual(inner);
    });

    it('should unwrap and parse cat.indices JSON string bodies', async () => {
        const raw = mockOpenSearchClient();
        raw.cat.indices.mockResolvedValue({ body: JSON.stringify([{ index: 'logs.2025-01-01' }]), statusCode: 200 });
        const client = new OpenSearchLogsClient({
            nodes: 'http://localhost:9200',
            requestTimeout: 1000,
            maxRetries: 0,
            auth: { username: 'u', password: 'p' }
        });
        (client as unknown as { client: typeof raw }).client = raw;

        const indices = await client.cat.indices({ format: 'json' });
        expect(indices).toEqual([{ index: 'logs.2025-01-01' }]);
    });
});

describe('CircuitBreakerLogsClient', () => {
    it('should fail fast when circuit breaker is unhealthy', async () => {
        const backend = {
            search: vi.fn(),
            index: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            updateByQuery: vi.fn(),
            get: vi.fn(),
            indices: {
                existsIndexTemplate: vi.fn(),
                putIndexTemplate: vi.fn(),
                exists: vi.fn(),
                getMapping: vi.fn(),
                getSettings: vi.fn(),
                delete: vi.fn()
            },
            ingest: { putPipeline: vi.fn() },
            cat: { indices: vi.fn() },
            healthCheck: vi.fn(),
            setupRetentionPolicies: vi.fn(),
            close: vi.fn()
        };

        const circuitBreaker = new CircuitBreaker({
            healthCheckIntervalMs: 0,
            failureThreshold: 1,
            recoveryThreshold: 1,
            healthCheck: () => Promise.resolve(false)
        });
        await circuitBreaker.run();
        await circuitBreaker.run();

        const wrapped = new CircuitBreakerLogsClient(backend, circuitBreaker);
        await expect(wrapped.search({ index: 'logs', query: { match_all: {} } })).rejects.toThrow('unhealthy');

        circuitBreaker.destroy();
    });
});
