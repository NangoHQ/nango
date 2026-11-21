import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearFunctionInputValidatorCache } from '@nangohq/shared/dist/services/functions/models/validate.js';

import { prepareFunctionDispatchExecution } from './dispatchFunction.js';

import type { DispatchContext } from './dispatch.js';
import type { MatchedFunctionExecution } from './dispatchFunction.js';
import type { DBFunctionConfigVersion } from '@nangohq/types';

const BUDGET_MS = 200;
const now = new Date('2026-01-01T00:00:00.000Z');

const version = {
    id: 61,
    function_config_id: 31,
    description: 'Test function',
    tags: {},
    file_location: 'functions/github/test',
    version: '1',
    source: 'repo',
    trigger: { kind: 'http', subscriptions: ['push'] },
    requires: { connection: true, outbound: false, invoke: false },
    capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
    limits: { concurrency: { perConnection: 'max' } },
    input_schema_ref: '#/definitions/Input',
    output_schema_ref: null,
    model_schema_refs: [],
    metadata_schema_ref: null,
    checkpoint_schema_ref: null,
    json_schema: {
        definitions: {
            Input: {
                type: 'object',
                properties: { body: { $ref: '#/definitions/Nested' } },
                required: ['body'],
                additionalProperties: false
            },
            Nested: { type: 'string', pattern: '^(a+)+$' }
        }
    },
    created_at: now,
    updated_at: now,
    deleted_at: null
} satisfies DBFunctionConfigVersion;

describe('prepareFunctionDispatchExecution pattern bounds', () => {
    beforeEach(() => {
        clearFunctionInputValidatorCache();
    });

    it('rejects a webhook payload that misses a deployed pattern before preparation occupies the worker', async () => {
        const input = { body: `${'a'.repeat(28)}!` };
        const logCtx = {
            id: 'log-1',
            operation: { id: 'log-1' },
            error: vi.fn().mockResolvedValue(undefined),
            enrichOperation: vi.fn().mockResolvedValue(undefined),
            failed: vi.fn().mockResolvedValue(undefined)
        };
        const execution = {
            config: { id: 31, uuid: '11111111-1111-4111-8111-111111111111', name: 'consume', enabled: true },
            version,
            subscription: 'push',
            connection: { id: 11, connection_id: 'conn-1', provider_config_key: 'github-dev', environment_id: 2 }
        } as MatchedFunctionExecution;
        const context = {
            team: { id: 1 },
            environment: { id: 2 },
            integration: { id: 3, unique_key: 'github-dev', provider: 'github' },
            request: { method: 'POST', path: '/webhook/github-dev', headers: {}, query: {}, body: input },
            logContextGetter: { create: vi.fn().mockResolvedValue(logCtx) }
        } as unknown as DispatchContext;

        const started = performance.now();
        const prepared = await prepareFunctionDispatchExecution({ context, execution, payload: input });
        const elapsed = performance.now() - started;

        expect(prepared).toBeNull();
        expect(elapsed).toBeLessThan(BUDGET_MS);
    }, 20_000);
});
