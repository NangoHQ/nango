import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import connectionService from '../connection.service.js';
import { invokeFunction } from './invoke.js';
import * as functionConfigService from './models/functions.js';
import { clearFunctionInputValidatorCache } from './models/validate.js';

import type { Orchestrator } from '../../clients/orchestrator.js';
import type { DBFunctionConfigVersion } from '@nangohq/types';

const BUDGET_MS = 200;
const now = new Date('2026-01-01T00:00:00.000Z');

const version = {
    id: 51,
    function_config_id: 1,
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

describe('invokeFunction pattern bounds', () => {
    const orchestrator = { invokeFunction: vi.fn() };

    beforeEach(() => {
        clearFunctionInputValidatorCache();
        orchestrator.invokeFunction.mockReset();
        vi.spyOn(functionConfigService, 'search').mockResolvedValue(
            Ok([
                {
                    integration: { id: 3, unique_key: 'github-dev', provider: 'github' },
                    config: { id: 1, uuid: '11111111-1111-4111-8111-111111111111', name: 'consume', enabled: true },
                    currentVersion: version
                } as Awaited<ReturnType<typeof functionConfigService.search>> extends { value: (infer Row)[] } ? Row : never
            ])
        );
        vi.spyOn(connectionService, 'getConnection').mockResolvedValue({
            response: { id: 11, connection_id: 'conn-1' }
        } as Awaited<ReturnType<typeof connectionService.getConnection>>);
    });

    it('rejects invoke input that misses a deployed pattern before the call occupies the worker', async () => {
        const started = performance.now();
        const invocation = await invokeFunction({
            account: { id: 1 } as Parameters<typeof invokeFunction>[0]['account'],
            environment: { id: 2 } as Parameters<typeof invokeFunction>[0]['environment'],
            connectionId: 'conn-1',
            functionUuid: '11111111-1111-4111-8111-111111111111',
            input: { body: `${'a'.repeat(28)}!` },
            request: { method: 'POST', path: '/functions/invoke', headers: {}, query: {} },
            invocationType: 'wait',
            orchestrator: orchestrator as unknown as Orchestrator
        });
        const elapsed = performance.now() - started;

        expect(invocation.result.isErr()).toBe(true);
        if (invocation.result.isErr()) {
            expect(invocation.result.error.code).toBe('validation_error');
        }
        expect(orchestrator.invokeFunction).not.toHaveBeenCalled();
        expect(elapsed).toBeLessThan(BUDGET_MS);
    }, 20_000);
});
