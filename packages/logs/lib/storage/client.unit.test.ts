import { describe, expect, it, vi } from 'vitest';

import { CircuitBreaker } from './circuitBreaker.js';
import { LogsStorage, getLogsStorageAdapter, mapArgsForOpenSearch, unwrapOpenSearchResult, wrapStorageClient } from './client.js';

describe('unwrapOpenSearchResult', () => {
    it('should unwrap OpenSearch transport envelope', () => {
        const inner = { hits: { total: { value: 1 } } };
        expect(unwrapOpenSearchResult({ body: inner, statusCode: 200 })).toEqual(inner);
    });

    it('should parse JSON string bodies from cat APIs', () => {
        const inner = [{ index: 'logs.2025-01-01' }];
        expect(unwrapOpenSearchResult({ body: JSON.stringify(inner), statusCode: 200 })).toEqual(inner);
    });

    it('should pass through values that are not transport envelopes', () => {
        expect(unwrapOpenSearchResult(true)).toBe(true);
        expect(unwrapOpenSearchResult({ hits: [] })).toEqual({ hits: [] });
    });
});

describe('mapArgsForOpenSearch', () => {
    it('should leave args unchanged for elasticsearch provider', () => {
        const args = [{ index: 'logs', query: { match_all: {} } }];
        expect(mapArgsForOpenSearch('search', args, 'elasticsearch')).toBe(args);
    });

    it('should move search DSL fields into body', () => {
        const [mapped] = mapArgsForOpenSearch(
            'search',
            [{ index: 'logs', size: 10, query: { term: { id: '1' } }, sort: [{ createdAt: 'desc' }] }],
            'opensearch'
        ) as [Record<string, unknown>];

        expect(mapped['index']).toBe('logs');
        expect(mapped['size']).toBe(10);
        expect(mapped['body']).toEqual({
            query: { term: { id: '1' } },
            sort: [{ createdAt: 'desc' }]
        });
    });

    it('should map document to body for index', () => {
        const [mapped] = mapArgsForOpenSearch('index', [{ index: 'logs', document: { id: '1' } }], 'opensearch') as [Record<string, unknown>];

        expect(mapped['body']).toEqual({ id: '1' });
        expect(mapped['document']).toBeUndefined();
    });

    it('should map query and script to body for updateByQuery', () => {
        const query = { term: { state: 'running' } };
        const script = { source: "ctx._source.state = 'cancelled'" };
        const [mapped] = mapArgsForOpenSearch('updateByQuery', [{ index: 'logs', query, script }], 'opensearch') as [Record<string, unknown>];

        expect(mapped['body']).toEqual({ query, script });
        expect(mapped['query']).toBeUndefined();
        expect(mapped['script']).toBeUndefined();
    });

    it('should map flat putIndexTemplate params to OpenSearch body shape', () => {
        const template = { settings: {}, mappings: {} };
        const [mapped] = mapArgsForOpenSearch(
            'putIndexTemplate',
            [
                {
                    name: 'logs-template',
                    index_patterns: 'logs.*',
                    template
                }
            ],
            'opensearch'
        ) as [Record<string, unknown>];

        expect(mapped['name']).toBe('logs-template');
        expect(mapped['body']).toEqual({
            index_patterns: ['logs.*'],
            template
        });
    });

    it('should map flat putPipeline params to OpenSearch body shape', () => {
        const processors = [{ date_index_name: { field: 'createdAt' } }];
        const [mapped] = mapArgsForOpenSearch('putPipeline', [{ id: 'daily.logs', description: 'Daily index', processors }], 'opensearch') as [
            Record<string, unknown>
        ];

        expect(mapped['id']).toBe('daily.logs');
        expect(mapped['body']).toEqual({ description: 'Daily index', processors });
    });

    it('should not remap when body is already present', () => {
        const args = [{ index: 'logs', body: { query: { match_all: {} } } }];
        expect(mapArgsForOpenSearch('search', args, 'opensearch')).toBe(args);
    });
});

describe('LogsStorage adapter selection', () => {
    it('should select opensearch adapter when provider is opensearch', () => {
        const storage = new LogsStorage('opensearch');
        expect(storage.provider).toBe('opensearch');
        expect(storage.adapter.provider).toBe('opensearch');
    });

    it('should select elasticsearch adapter when provider is elasticsearch', () => {
        const storage = new LogsStorage('elasticsearch');
        expect(storage.provider).toBe('elasticsearch');
        expect(storage.adapter.provider).toBe('elasticsearch');
    });
});

describe('wrapStorageClient', () => {
    it('should recursively unwrap nested API responses for opensearch', async () => {
        const inner = { 'logs.2025-01-01': { settings: { index: { number_of_shards: '1' } } } };
        const raw = {
            indices: {
                getSettings: vi.fn().mockResolvedValue({ body: inner, statusCode: 200 })
            },
            close: vi.fn()
        };

        const circuitBreaker = new CircuitBreaker({
            healthCheckIntervalMs: 0,
            failureThreshold: 1,
            recoveryThreshold: 1,
            healthCheck: async () => Promise.resolve(true)
        });

        const wrapped = wrapStorageClient(raw as never, circuitBreaker, getLogsStorageAdapter('opensearch'));
        const settings = await wrapped.indices.getSettings({ index: 'logs' });

        expect(settings).toEqual(inner);
        expect(raw.indices.getSettings).toHaveBeenCalledWith({ index: 'logs' });

        circuitBreaker.destroy();
    });

    it('should map nested putIndexTemplate args for opensearch', async () => {
        const raw = {
            indices: {
                putIndexTemplate: vi.fn().mockResolvedValue({ body: { acknowledged: true }, statusCode: 200 })
            },
            close: vi.fn()
        };

        const circuitBreaker = new CircuitBreaker({
            healthCheckIntervalMs: 0,
            failureThreshold: 1,
            recoveryThreshold: 1,
            healthCheck: async () => Promise.resolve(true)
        });

        const wrapped = wrapStorageClient(raw as never, circuitBreaker, getLogsStorageAdapter('opensearch'));
        await wrapped.indices.putIndexTemplate({
            name: 'logs-template',
            index_patterns: 'logs.*',
            template: { settings: {}, mappings: {} }
        });

        expect(raw.indices.putIndexTemplate).toHaveBeenCalledWith({
            name: 'logs-template',
            body: {
                index_patterns: ['logs.*'],
                template: { settings: {}, mappings: {} }
            }
        });

        circuitBreaker.destroy();
    });

    it('should recursively unwrap cat API responses for opensearch', async () => {
        class CatApi {
            indices = vi.fn().mockResolvedValue({ body: JSON.stringify([{ index: 'logs.2025-01-01' }]), statusCode: 200 });
        }
        const raw = { cat: new CatApi(), close: vi.fn() };

        const circuitBreaker = new CircuitBreaker({
            healthCheckIntervalMs: 0,
            failureThreshold: 1,
            recoveryThreshold: 1,
            healthCheck: async () => Promise.resolve(true)
        });

        const wrapped = wrapStorageClient(raw as never, circuitBreaker, getLogsStorageAdapter('opensearch'));
        const indices = await wrapped.cat.indices({ format: 'json' });

        expect(indices).toEqual([{ index: 'logs.2025-01-01' }]);

        circuitBreaker.destroy();
    });
});
