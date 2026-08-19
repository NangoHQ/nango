import { errors as osErrors } from '@opensearch-project/opensearch';
import { describe, expect, it, vi } from 'vitest';

import { policyMessages, policyOperations } from '../es/schema.js';
import { putIsmPolicies } from './ismPolicies.js';

import type { Client as OpenSearchClient } from '@opensearch-project/opensearch';

function mockTransport() {
    return { request: vi.fn() };
}

function asClient(transport: ReturnType<typeof mockTransport>): OpenSearchClient {
    return { transport } as unknown as OpenSearchClient;
}

describe('putIsmPolicies', () => {
    it('creates a fresh policy with no querystring when none exists yet', async () => {
        const transport = mockTransport();
        transport.request.mockImplementation(({ method }: { method: string }) => {
            if (method === 'GET') {
                throw new osErrors.ResponseError({ statusCode: 404 } as any);
            }
            return Promise.resolve({ body: {}, statusCode: 200 });
        });

        await putIsmPolicies(asClient(transport));

        const putCalls = transport.request.mock.calls.filter(([params]) => params.method === 'PUT');
        expect(putCalls).toHaveLength(2);
        for (const [params] of putCalls) {
            expect(params.querystring).toBeUndefined();
        }
    });

    it('updates an existing policy in place using its own seq_no/primary_term', async () => {
        const transport = mockTransport();
        const versions: Record<string, { _seq_no: number; _primary_term: number }> = {
            [`/_plugins/_ism/policies/${policyOperations.name}`]: { _seq_no: 7, _primary_term: 1 },
            [`/_plugins/_ism/policies/${policyMessages.name}`]: { _seq_no: 42, _primary_term: 3 }
        };

        transport.request.mockImplementation(({ method, path }: { method: string; path: string }) => {
            if (method === 'GET') {
                return Promise.resolve({ body: versions[path], statusCode: 200 });
            }
            return Promise.resolve({ body: {}, statusCode: 200 });
        });

        await putIsmPolicies(asClient(transport));

        const putCalls = transport.request.mock.calls.filter(([params]) => params.method === 'PUT');
        expect(putCalls).toHaveLength(2);

        const operationsPut = putCalls.find(([params]) => params.path === `/_plugins/_ism/policies/${policyOperations.name}`)![0];
        expect(operationsPut.querystring).toStrictEqual({ if_seq_no: 7, if_primary_term: 1 });

        const messagesPut = putCalls.find(([params]) => params.path === `/_plugins/_ism/policies/${policyMessages.name}`)![0];
        expect(messagesPut.querystring).toStrictEqual({ if_seq_no: 42, if_primary_term: 3 });
    });

    it('does not throw when the versioned PUT loses a race to another instance (409)', async () => {
        const transport = mockTransport();
        transport.request.mockImplementation(({ method }: { method: string }) => {
            if (method === 'GET') {
                return Promise.resolve({ body: { _seq_no: 1, _primary_term: 1 }, statusCode: 200 });
            }
            throw new osErrors.ResponseError({ statusCode: 409 } as any);
        });

        await expect(putIsmPolicies(asClient(transport))).resolves.toBeUndefined();
    });

    it('rethrows on a genuine PUT failure', async () => {
        const transport = mockTransport();
        transport.request.mockImplementation(({ method }: { method: string }) => {
            if (method === 'GET') {
                return Promise.resolve({ body: { _seq_no: 1, _primary_term: 1 }, statusCode: 200 });
            }
            throw new osErrors.ResponseError({ statusCode: 500 } as any);
        });

        await expect(putIsmPolicies(asClient(transport))).rejects.toThrow();
    });

    it('rethrows on a genuine GET failure instead of treating it as "does not exist"', async () => {
        const transport = mockTransport();
        transport.request.mockImplementation(({ method }: { method: string }) => {
            if (method === 'GET') {
                throw new osErrors.ResponseError({ statusCode: 500 } as any);
            }
            return Promise.resolve({ body: {}, statusCode: 200 });
        });

        await expect(putIsmPolicies(asClient(transport))).rejects.toThrow();

        const putCalls = transport.request.mock.calls.filter(([params]) => params.method === 'PUT');
        expect(putCalls).toHaveLength(0);
    });
});
