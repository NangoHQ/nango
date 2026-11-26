import { errors as osErrors } from '@opensearch-project/opensearch';
import { describe, expect, it, vi } from 'vitest';

import { indexMessages, indexOperations, policyMessages, policyOperations } from '../es/schema.js';
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
            if (method === 'PUT') {
                throw new osErrors.ResponseError({ statusCode: 409 } as any);
            }
            return Promise.resolve({ body: {}, statusCode: 200 });
        });

        await expect(putIsmPolicies(asClient(transport))).resolves.toBeUndefined();
    });

    it('attaches each policy to new indices through its ism_template', async () => {
        const transport = mockTransport();
        transport.request.mockImplementation(({ method }: { method: string }) => {
            if (method === 'GET') {
                throw new osErrors.ResponseError({ statusCode: 404 } as any);
            }
            return Promise.resolve({ body: {}, statusCode: 200 });
        });

        await putIsmPolicies(asClient(transport));

        const putCalls = transport.request.mock.calls.filter(([params]) => params.method === 'PUT');
        const operationsPut = putCalls.find(([params]) => params.path === `/_plugins/_ism/policies/${policyOperations.name}`)![0];
        expect(operationsPut.body.policy.ism_template).toStrictEqual([{ index_patterns: [`${indexOperations.index}.*`], priority: 100 }]);

        const messagesPut = putCalls.find(([params]) => params.path === `/_plugins/_ism/policies/${policyMessages.name}`)![0];
        expect(messagesPut.body.policy.ism_template).toStrictEqual([{ index_patterns: [`${indexMessages.index}.*`], priority: 100 }]);
    });

    it('adds each policy to the indices that already exist', async () => {
        const transport = mockTransport();
        transport.request.mockImplementation(({ method }: { method: string }) => {
            if (method === 'GET') {
                throw new osErrors.ResponseError({ statusCode: 404 } as any);
            }
            return Promise.resolve({ body: { updated_indices: 3 }, statusCode: 200 });
        });

        await putIsmPolicies(asClient(transport));

        const addCalls = transport.request.mock.calls
            .filter(([params]) => params.method === 'POST')
            .map(([params]) => ({ path: params.path, body: params.body }));
        expect(addCalls).toStrictEqual([
            { path: `/_plugins/_ism/add/${encodeURIComponent(`${indexOperations.index}.*`)}`, body: { policy_id: policyOperations.name } },
            { path: `/_plugins/_ism/add/${encodeURIComponent(`${indexMessages.index}.*`)}`, body: { policy_id: policyMessages.name } }
        ]);
    });

    it('does not throw when adding the policy to existing indices is not allowed (403)', async () => {
        const transport = mockTransport();
        transport.request.mockImplementation(({ method }: { method: string }) => {
            if (method === 'GET') {
                throw new osErrors.ResponseError({ statusCode: 404 } as any);
            }
            if (method === 'POST') {
                throw new osErrors.ResponseError({ statusCode: 403 } as any);
            }
            return Promise.resolve({ body: {}, statusCode: 200 });
        });

        await expect(putIsmPolicies(asClient(transport))).resolves.toBeUndefined();
    });

    it('does not throw when no index matches the pattern yet (404)', async () => {
        const transport = mockTransport();
        transport.request.mockImplementation(({ method }: { method: string }) => {
            if (method === 'GET' || method === 'POST') {
                throw new osErrors.ResponseError({ statusCode: 404 } as any);
            }
            return Promise.resolve({ body: {}, statusCode: 200 });
        });

        await expect(putIsmPolicies(asClient(transport))).resolves.toBeUndefined();
    });

    it.each([400, 403])('puts the policy without ism_template when it is rejected (%i)', async (statusCode) => {
        const transport = mockTransport();
        transport.request.mockImplementation(({ method, body }: { method: string; body?: { policy: { ism_template?: unknown } } }) => {
            if (method === 'GET') {
                throw new osErrors.ResponseError({ statusCode: 404 } as any);
            }
            if (method === 'PUT' && body?.policy.ism_template) {
                throw new osErrors.ResponseError({ statusCode } as any);
            }
            return Promise.resolve({ body: {}, statusCode: 200 });
        });

        await expect(putIsmPolicies(asClient(transport))).resolves.toBeUndefined();

        const putBodies = transport.request.mock.calls.filter(([params]) => params.method === 'PUT').map(([params]) => params.body.policy);
        expect(putBodies).toHaveLength(4);
        expect(putBodies.filter((policy) => policy.ism_template)).toHaveLength(2);
        expect(putBodies.filter((policy) => !policy.ism_template)).toHaveLength(2);

        const addCalls = transport.request.mock.calls.filter(([params]) => params.method === 'POST');
        expect(addCalls).toHaveLength(0);
    });

    it('rethrows when the policy is also rejected without ism_template', async () => {
        const transport = mockTransport();
        transport.request.mockImplementation(({ method }: { method: string }) => {
            if (method === 'GET') {
                throw new osErrors.ResponseError({ statusCode: 404 } as any);
            }
            if (method === 'PUT') {
                throw new osErrors.ResponseError({ statusCode: 403 } as any);
            }
            return Promise.resolve({ body: {}, statusCode: 200 });
        });

        await expect(putIsmPolicies(asClient(transport))).rejects.toThrow();
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
